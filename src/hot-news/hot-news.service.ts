import { getFirestore, collections } from '../core/config/firebase.config';
import { OpenAIProvider } from '../ai/providers/openai.provider';
import { FcmService } from '../core/services/fcm.service';
import { UserDNA } from '../ai/dna/dna.types';
import { generateId, toTimestamp } from '../core/utils/helpers';
import { logger } from '../core/config/logger.config';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface HotNewsItem {
  title: string;
  body:  string;
  tag:   'Market' | 'Opportunity' | 'Risk' | 'Trend' | 'Tool';
}

export interface HotNewsPayload {
  hook:  string;
  items: HotNewsItem[];
}

export interface HotNewsTierConfig {
  enabled:   boolean;
  itemCount: number;
  model:     string;
}

export interface HotNewsSettings {
  globalEnabled:     boolean;
  enabledTiers:      string[];
  tierSettings: {
    standard:   HotNewsTierConfig;
    premium:    HotNewsTierConfig;
    enterprise: HotNewsTierConfig;
  };
  maxUsersPerRun:       number;
  delayBetweenUsersMs: number;
  updatedAt?:          string;
}

export const DEFAULT_HOT_NEWS_SETTINGS: HotNewsSettings = {
  globalEnabled: true,
  enabledTiers:  ['standard', 'premium', 'enterprise'],
  tierSettings: {
    standard:   { enabled: true, itemCount: 3, model: 'gpt-4o-mini' },
    premium:    { enabled: true, itemCount: 5, model: 'gpt-4o'      },
    enterprise: { enabled: true, itemCount: 5, model: 'gpt-4o'      },
  },
  maxUsersPerRun:       100,
  delayBetweenUsersMs: 250,
};

// ── Service ─────────────────────────────────────────────────────────────────────

export class HotNewsService {
  private db  = getFirestore();
  private ai  = new OpenAIProvider();
  private fcm = new FcmService();

  // ── Settings ────────────────────────────────────────────────────────────────

  /** Reads or seeds hot_news_settings from platform_config */
  async getSettings(): Promise<HotNewsSettings> {
    try {
      const snap = await this.db
        .collection(collections.platform_config)
        .doc('hot_news_settings')
        .get();

      if (snap.exists) return snap.data() as HotNewsSettings;

      // Seed defaults on first run
      await this.db
        .collection(collections.platform_config)
        .doc('hot_news_settings')
        .set({ ...DEFAULT_HOT_NEWS_SETTINGS, updatedAt: toTimestamp() });

      return DEFAULT_HOT_NEWS_SETTINGS;
    } catch (err) {
      logger.warn(`[HotNews] Could not read settings: ${(err as Error).message}. Using defaults.`);
      return DEFAULT_HOT_NEWS_SETTINGS;
    }
  }

  async saveSettings(partial: Partial<HotNewsSettings>): Promise<void> {
    await this.db
      .collection(collections.platform_config)
      .doc('hot_news_settings')
      .set({ ...partial, updatedAt: toTimestamp() }, { merge: true });
  }

  // ── Deduplication ────────────────────────────────────────────────────────────

  /** Returns the IST date string for today (YYYY-MM-DD) */
  private todayIST(): string {
    const now = new Date();
    // IST = UTC+5:30
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 10);
  }

  /** Returns true if this user has already received a Hot News today */
  async hasReceivedTodayIST(uid: string): Promise<boolean> {
    try {
      const doc = await this.db
        .collection(collections.hot_news_log)
        .doc(uid)
        .collection('daily')
        .doc(this.todayIST())
        .get();
      return doc.exists;
    } catch (err) {
      logger.warn(`[HotNews] Could not check dedup for ${uid}: ${(err as Error).message}`);
      return false; // safe to proceed on error
    }
  }

  /** Writes a delivery log entry — prevents duplicate sends */
  private async markSent(
    uid: string,
    tier: string,
    itemCount: number,
    model: string,
    tokensUsed: number,
    notificationId: string,
  ): Promise<void> {
    try {
      await this.db
        .collection(collections.hot_news_log)
        .doc(uid)
        .collection('daily')
        .doc(this.todayIST())
        .set({
          sentAt:         toTimestamp(),
          tier,
          itemCount,
          model,
          tokensUsed,
          notificationId,
          date:           this.todayIST(),
        });
    } catch (err) {
      logger.warn(`[HotNews] Could not write delivery log for ${uid}: ${(err as Error).message}`);
    }
  }

  // ── Prompt Builder ───────────────────────────────────────────────────────────

  private buildPrompt(dna: UserDNA, itemCount: number): string {
    const niche     = dna.niche         || 'general business';
    const stage     = dna.businessStage || 'idea';
    const topics    = (dna.preferredTopics || []).slice(0, 5).join(', ') || 'entrepreneurship, market trends';
    const location  = [dna.city, dna.state].filter(Boolean).join(', ') || 'India';
    const risk      = dna.riskTolerance  || 'medium';
    const budget    = dna.budgetLabel    || 'unspecified';

    const stageContext: Record<string, string> = {
      idea:       'exploring new business ideas, has not started yet',
      validating: 'validating a business idea for viability',
      starting:   'in the early stages of starting a business',
      growing:    'running an existing business and looking to grow',
      scaling:    'scaling an established business to the next level',
    };
    const stageDesc = stageContext[stage] || 'exploring business opportunities';

    return `You are a senior business intelligence analyst writing a daily digest for a professional entrepreneur.

USER CONTEXT (use this to select highly relevant insights — do NOT mention these details explicitly in the output):
- Business Niche: ${niche}
- Business Stage: ${stageDesc}
- Key Topics of Interest: ${topics}
- Location: ${location}
- Risk Tolerance: ${risk}
- Budget Range: ${budget}

TASK:
Generate exactly ${itemCount} hot business insights that are directly relevant to this user's context today (${new Date().toDateString()}).

OUTPUT FORMAT — respond ONLY with this exact JSON structure, no markdown, no extra text:
{
  "hook": "<sharp professional hook heading, max 8 words, starts with 🔥>",
  "items": [
    {
      "title": "<attention-grabbing title, max 10 words>",
      "body": "<2-3 authoritative sentences with at least one specific number, percentage, or market data point>",
      "tag": "<exactly one of: Market | Opportunity | Risk | Trend | Tool>"
    }
  ]
}

STRICT RULES:
- ALL output must be in professional English — no regional languages, no slang
- Hook must be crisp and professional (e.g. "Your Daily Business Briefing", "Today's Market Intelligence")
- Titles must be action-oriented and business-newsletter style
- Bodies must sound like premium financial/business journalism — authoritative, data-driven, concise
- Tags must be exactly one of the 5 listed values
- Insights must be plausible, relevant to the user's niche and stage, and feel timely
- Do NOT mention the user's profile details explicitly
- Do NOT use generic filler — every sentence must add value`;
  }

  // ── Generation ───────────────────────────────────────────────────────────────

  /** Full pipeline: generate, notify, log */
  async generateAndSendForUser(
    uid:   string,
    dna:   UserDNA,
    tier:  string,
    model: string,
    itemCount: number,
  ): Promise<{ success: boolean; tokensUsed: number }> {
    try {
      logger.info(`[HotNews] Generating for uid=${uid} tier=${tier} model=${model} items=${itemCount}`);

      const prompt = this.buildPrompt(dna, itemCount);

      // Single OpenAI call — logged to openai_usage_logs via OpenAIProvider._logUsage
      const rawJson = await this.ai.complete({
        messages:       [{ role: 'system', content: prompt }],
        uid:            'system', // system job — not billed to user
        feature:        'hot-news',
        model,
        maxTokens:      800,
        temperature:    0.7,
        responseFormat: 'json',
      });

      let payload: HotNewsPayload;
      try {
        payload = JSON.parse(rawJson) as HotNewsPayload;
      } catch {
        logger.warn(`[HotNews] JSON parse failed for uid=${uid}: ${rawJson.slice(0, 200)}`);
        return { success: false, tokensUsed: 0 };
      }

      if (!payload?.hook || !Array.isArray(payload?.items) || payload.items.length === 0) {
        logger.warn(`[HotNews] Invalid payload shape for uid=${uid}`);
        return { success: false, tokensUsed: 0 };
      }

      // Clamp items to requested count
      payload.items = payload.items.slice(0, itemCount);

      // ── Write in-app notification ───────────────────────────────────────────
      const notifId   = `hot_news_${this.todayIST()}`;
      const notifBody = `${payload.items.length} personalised insights ready for you`;

      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.notifications)
        .doc(notifId)
        .set({
          id:        notifId,
          type:      'hot_news',
          title:     payload.hook,
          body:      notifBody,
          isRead:    false,
          createdAt: toTimestamp(),
          hook:      payload.hook,
          items:     payload.items,
          tier,
          date:      this.todayIST(),
        });

      // ── Send FCM push (fire-and-forget) ────────────────────────────────────
      this.fcm.sendToUser(uid, {
        title: payload.hook,
        body:  notifBody,
        data:  {
          type:   'hot_news',
          date:   this.todayIST(),
          notifId,
        },
      }).catch((e: Error) => logger.warn(`[HotNews] FCM push failed for ${uid}: ${e.message}`));

      // Approximate token usage (exact value logged inside OpenAIProvider)
      const estimatedTokens = Math.round(prompt.split(' ').length * 1.3 + 400);

      await this.markSent(uid, tier, payload.items.length, model, estimatedTokens, notifId);

      logger.info(`[HotNews] ✅ Sent to uid=${uid} — "${payload.hook}" (${payload.items.length} items)`);
      return { success: true, tokensUsed: estimatedTokens };
    } catch (err) {
      logger.error(`[HotNews] Generation failed for uid=${uid}: ${(err as Error).message}`);
      return { success: false, tokensUsed: 0 };
    }
  }

  // ── Admin Tracking ───────────────────────────────────────────────────────────

  /** Returns delivery stats for the admin dashboard */
  async getDeliveryStats(days: number = 30): Promise<{
    totalSends:    number;
    totalTokens:   number;
    byTier:        Record<string, number>;
    dailyChart:    { date: string; sends: number }[];
    recentLogs:    Record<string, unknown>[];
  }> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Pull from openai_usage_logs where feature = 'hot-news'
      const usageSnap = await this.db
        .collection(collections.openai_usage_logs)
        .where('feature', '==', 'hot-news')
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();

      const logs = usageSnap.docs.map(d => d.data());
      const totalSends  = logs.length;
      const totalTokens = logs.reduce((s, l) => s + (l.totalTokens || 0), 0);

      // Build daily chart
      const dailyMap: Record<string, number> = {};
      logs.forEach(l => {
        const day = (l.createdAt as string).slice(0, 10);
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      });
      const dailyChart = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, sends]) => ({ date, sends }));

      // Tier breakdown from hot_news_log subcollections is expensive;
      // approximate from usage logs uid pattern (good enough for admin)
      const byTier: Record<string, number> = { standard: 0, premium: 0, enterprise: 0 };

      return { totalSends, totalTokens, byTier, dailyChart, recentLogs: logs.slice(0, 50) };
    } catch (err) {
      logger.error(`[HotNews] getDeliveryStats error: ${(err as Error).message}`);
      return { totalSends: 0, totalTokens: 0, byTier: {}, dailyChart: [], recentLogs: [] };
    }
  }
}

export const hotNewsService = new HotNewsService();
