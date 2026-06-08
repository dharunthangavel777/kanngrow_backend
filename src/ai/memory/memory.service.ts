import { getFirestore, collections } from '../../core/config/firebase.config';
import { OpenAIProvider } from '../providers/openai.provider';
import { toTimestamp, generateId } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

// ── Memory Types ─────────────────────────────────────────────────────────────
export type MemoryCategory =
  | 'business_idea' | 'decision' | 'goal' | 'preference'
  | 'milestone' | 'budget' | 'location' | 'rejection' | 'context';

export interface WorkingMemory {
  id: string;
  uid: string;
  fact: string;
  category: MemoryCategory;
  importance: number;    // 1–10
  confidence: number;    // 0–1
  mentionCount: number;
  source: 'chat' | 'behavior' | 'profile';
  createdAt: string;
  lastRelevantAt: string;
}

export interface LongTermMemory {
  uid: string;
  userStory: string;
  businessSummary: string;
  keyDecisions: string[];
  currentGoals: string[];
  lastSummarizedAt: string;
  conversationCount: number;
}

export interface MemoryTiers {
  working: WorkingMemory[];
  longTerm: LongTermMemory | null;
}

// ── Memory Service V2 (3-Tier) ────────────────────────────────────────────────
export class MemoryService {
  private db = getFirestore();
  private ai = new OpenAIProvider();

  async getMemoryTiers(uid: string): Promise<MemoryTiers> {
    try {
      const [workingSnap, ltSnap] = await Promise.all([
        this.db.collection(collections.users).doc(uid)
          .collection(collections.memory_working)
          .orderBy('importance', 'desc')
          .limit(12)
          .get(),
        this.db.collection(collections.memory_longterm).doc(uid).get(),
      ]);
      const working = workingSnap.docs.map((d: any) => d.data() as WorkingMemory);
      const longTerm = ltSnap.exists ? ltSnap.data() as LongTermMemory : null;
      return { working, longTerm };
    } catch (err) {
      logger.warn(`Memory fetch failed for ${uid}: ${(err as Error).message}`);
      return { working: [], longTerm: null };
    }
  }

  formatForPrompt(memory: MemoryTiers): string {
    const parts: string[] = [];
    if (memory.longTerm?.userStory) parts.push(`USER JOURNEY:\n${memory.longTerm.userStory}`);
    if (memory.longTerm?.businessSummary) parts.push(`CURRENT STATUS: ${memory.longTerm.businessSummary}`);
    if (memory.working.length > 0) {
      const facts = memory.working.filter((m: any) => m.importance >= 4).slice(0, 10)
        .map((m: any) => `- ${m.fact}`).join('\n');
      if (facts) parts.push(`WHAT I KNOW:\n${facts}`);
    }
    if (memory.longTerm?.keyDecisions?.length) {
      parts.push(`KEY DECISIONS:\n${memory.longTerm.keyDecisions.slice(0, 3).map((d: any) => `- ${d}`).join('\n')}`);
    }
    return parts.join('\n\n');
  }

  async extractAndSave(uid: string, userMessage: string, aiReply: string): Promise<void> {
    try {
      const extracted = await this.ai.completeJSON<{
        facts: Array<{ fact: string; category: MemoryCategory; importance: number }>;
      }>({
        messages: [
          {
            role: 'system',
            content: `Extract concise, factual memory items from this conversation for future AI use.
Focus on: business decisions, goals, preferences, budget, location, product choices, rejections.
Importance 8-10: Explicit decisions, confirmed goals; 5-7: Preferences, stage info; 1-4: Minor context.
Return JSON only: { "facts": [{ "fact": "...", "category": "business_idea|decision|goal|preference|milestone|budget|location|rejection|context", "importance": 7 }] }
If nothing significant, return { "facts": [] }`,
          },
          {
            role: 'user',
            content: `User: "${userMessage}"\nAI: "${aiReply.slice(0, 400)}"`,
          },
        ],
        responseFormat: 'json',
        maxTokens: 300,
        temperature: 0.2,
        uid,
        feature: 'memory-extraction',
      });

      for (const item of extracted.facts) {
        await this.upsertFact(uid, item);
      }
    } catch (err) {
      logger.warn(`Memory extraction failed: ${(err as Error).message}`);
    }
  }

  private async upsertFact(uid: string, item: { fact: string; category: MemoryCategory; importance: number }): Promise<void> {
    try {
      const ref = this.db.collection(collections.users).doc(uid).collection(collections.memory_working);
      const existing = await ref.where('category', '==', item.category).where('importance', '>=', 5).limit(5).get();

      const keyWords = item.fact.toLowerCase().split(' ').filter(w => w.length > 4);
      const similar = existing.docs.find(d => {
        const ef = (d.data() as WorkingMemory).fact.toLowerCase();
        return keyWords.some(w => ef.includes(w));
      });

      if (similar) {
        await similar.ref.update({
          fact: item.fact,
          importance: Math.min(10, (similar.data() as WorkingMemory).importance + 1),
          mentionCount: ((similar.data() as WorkingMemory).mentionCount || 1) + 1,
          lastRelevantAt: toTimestamp(),
        });
      } else {
        const id = generateId();
        await ref.doc(id).set({
          id, uid,
          fact: item.fact,
          category: item.category,
          importance: item.importance,
          confidence: 0.8,
          mentionCount: 1,
          source: 'chat',
          createdAt: toTimestamp(),
          lastRelevantAt: toTimestamp(),
        } as WorkingMemory);
      }
    } catch (err) {
      logger.warn(`Memory upsert failed: ${(err as Error).message}`);
    }
  }

  async summarizeToLongTerm(uid: string): Promise<void> {
    try {
      const tiers = await this.getMemoryTiers(uid);
      const existingStory = tiers.longTerm?.userStory || '';
      const facts = tiers.working.map((m: any) => m.fact).join('\n');
      if (!facts) return;

      const summary = await this.ai.completeJSON<{
        userStory: string; businessSummary: string; keyDecisions: string[]; currentGoals: string[];
      }>({
        messages: [
          {
            role: 'system',
            content: `Write a concise memory summary for an AI assistant. Create a warm, 3-4 sentence narrative describing this user's business journey. Make it immediately useful for an AI to understand who this person is.
Respond with JSON: { "userStory": "...", "businessSummary": "...", "keyDecisions": ["..."], "currentGoals": ["..."] }`,
          },
          {
            role: 'user',
            content: `Previous story: "${existingStory}"\nNew facts:\n${facts}`,
          },
        ],
        responseFormat: 'json',
        maxTokens: 500,
        temperature: 0.3,
        uid,
        feature: 'memory-summarize',
      });

      await this.db.collection(collections.memory_longterm).doc(uid).set({
        uid,
        userStory: summary.userStory,
        businessSummary: summary.businessSummary,
        keyDecisions: summary.keyDecisions || [],
        currentGoals: summary.currentGoals || [],
        lastSummarizedAt: toTimestamp(),
        conversationCount: (tiers.longTerm?.conversationCount || 0) + 1,
      } as LongTermMemory);

      logger.info(`Long-term memory updated for ${uid}`);
    } catch (err) {
      logger.warn(`Memory summarization failed: ${(err as Error).message}`);
    }
  }

  async clearMemory(uid: string): Promise<void> {
    const snap = await this.db.collection(collections.users).doc(uid)
      .collection(collections.memory_working).get();
    const batch = this.db.batch();
    snap.docs.forEach((d: any) => batch.delete(d.ref));
    await batch.commit();
    await this.db.collection(collections.memory_longterm).doc(uid).delete();
  }

  // Legacy compatibility
  async getMemoryFacts(uid: string): Promise<{ fact: string }[]> {
    const tiers = await this.getMemoryTiers(uid);
    return tiers.working.map((m: any) => ({ fact: m.fact }));
  }
}
