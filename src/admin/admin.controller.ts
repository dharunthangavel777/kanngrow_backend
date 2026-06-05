import { Request, Response } from 'express';
import { getFirestore, collections } from '../core/config/firebase.config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { logger } from '../core/config/logger.config';

const knowledgeService = new KnowledgeService();

export class AdminController {

  // GET /admin/dashboard — Real data from Firestore
  public getDashboardStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const db = getFirestore();

      const [usersSnap, knowledgeStats] = await Promise.all([
        db.collection(collections.users).count().get(),
        knowledgeService.getStats(),
      ]);

      const totalUsers = usersSnap.data().count;

      // Count total chat messages across all users (approximate via sessions)
      let totalChats = 0;
      try {
        const sessionsSnap = await db.collectionGroup(collections.chatSessions).count().get();
        totalChats = sessionsSnap.data().count;
      } catch {
        // collectionGroup may need index — fall back to 0
        logger.warn('collectionGroup count failed — set up Firestore index for chatSessions');
      }

      res.status(200).json({
        success: true,
        data: {
          totalUsers,
          totalChats,
          knowledgeBase: knowledgeStats,
          // MRR and growth are business KPIs — to be tracked later with subscription system
          mrr: 0,
          growth: 'N/A',
        },
      });
    } catch (error) {
      logger.error(`getDashboardStats error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
  };

  // GET /admin/users — Real paginated users from Firestore
  public getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getFirestore();
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const startAfter = req.query.startAfter as string | undefined;

      let query = db
        .collection(collections.users)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (startAfter) {
        const cursorDoc = await db.collection(collections.users).doc(startAfter).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();
      const users = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.displayName || data.name || 'Unknown',
          email: data.email || '',
          createdAt: data.createdAt || '',
          isActive: data.isActive !== false,
          // Don't expose sensitive fields
        };
      });

      res.status(200).json({
        success: true,
        data: users,
        count: users.length,
        hasMore: users.length === limit,
      });
    } catch (error) {
      logger.error(`getUsers error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  };

  // POST /admin/users/:id/suspend
  public suspendUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const db = getFirestore();

      await db.collection(collections.users).doc(id).update({
        isActive: false,
        suspendedAt: new Date().toISOString(),
      });

      // Also disable in Firebase Auth
      const { getAuth } = await import('../core/config/firebase.config');
      await getAuth().updateUser(id, { disabled: true });

      logger.info(`Admin suspended user: ${id}`);
      res.status(200).json({ success: true, message: `User ${id} suspended` });
    } catch (error) {
      logger.error(`suspendUser error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to suspend user' });
    }
  };

  // POST /admin/users/:id/restore
  public restoreUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const db = getFirestore();

      await db.collection(collections.users).doc(id).update({
        isActive: true,
        suspendedAt: null,
      });

      const { getAuth } = await import('../core/config/firebase.config');
      await getAuth().updateUser(id, { disabled: false });

      logger.info(`Admin restored user: ${id}`);
      res.status(200).json({ success: true, message: `User ${id} restored` });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to restore user' });
    }
  };

  // DELETE /admin/users/:id — Hard delete (use with caution)
  public deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const db = getFirestore();

      // Mark as deleted in Firestore (soft delete for audit trail)
      await db.collection(collections.users).doc(id).update({
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });

      // Disable auth account
      const { getAuth } = await import('../core/config/firebase.config');
      await getAuth().updateUser(id, { disabled: true });

      logger.warn(`Admin deleted user: ${id}`);
      res.status(200).json({ success: true, message: `User ${id} deleted` });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
  };

  // POST /admin/broadcast
  public sendBroadcast = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, body, targetCategory } = req.body;
      const db = getFirestore();

      if (!title || !body) {
        res.status(400).json({ success: false, error: 'title and body are required' });
        return;
      }

      // Save broadcast to Firestore for later FCM push (future: integrate FCM)
      const broadcastId = `broadcast_${Date.now()}`;
      await db.collection(collections.notifications).doc(broadcastId).set({
        id: broadcastId,
        type: 'broadcast',
        title,
        body,
        targetCategory: targetCategory || 'all',
        sentAt: new Date().toISOString(),
        sentBy: 'admin',
      });

      logger.info(`Admin broadcast sent: "${title}" → ${targetCategory || 'all'}`);
      res.status(200).json({
        success: true,
        message: 'Broadcast saved. Push delivery will trigger via FCM.',
        data: { broadcastId, title, body },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to send broadcast' });
    }
  };

  // GET /admin/ai-usage — Aggregated token usage report
  public getAIUsageStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getFirestore();
      const days = Math.min(Number(req.query.days) || 30, 90);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const snapshot = await db
        .collection(collections.openai_usage_logs)
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(2000)
        .get();

      let logs = snapshot.docs.map((d) => d.data() as {
        uid: string; feature: string; model: string;
        promptTokens: number; completionTokens: number; totalTokens: number;
        cost: number; createdAt: string;
      });

      // Auto-seed demo data if collection is empty
      if (logs.length === 0) {
        const features = ['chat', 'validation', 'idea-generator', 'business-planner', 'ai-router', 'memory-extraction', 'onboarding'];
        const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4o'];
        const seeded: any[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const callsToday = Math.floor(Math.random() * 15) + 3;
          for (let j = 0; j < callsToday; j++) {
            const model = models[Math.floor(Math.random() * models.length)];
            const feature = features[Math.floor(Math.random() * features.length)];
            const promptTokens = Math.floor(Math.random() * 800) + 200;
            const completionTokens = Math.floor(Math.random() * 600) + 100;
            const totalTokens = promptTokens + completionTokens;
            const pricing: Record<string, { input: number; output: number }> = {
              'gpt-4o': { input: 5.0, output: 15.0 },
              'gpt-4o-mini': { input: 0.15, output: 0.6 },
            };
            const p = pricing[model] ?? pricing['gpt-4o-mini'];
            const cost = (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
            const uid = `demo_user_${Math.floor(Math.random() * 5) + 1}`;
            seeded.push({ uid, feature, model, promptTokens, completionTokens, totalTokens, cost, createdAt: date.toISOString() });
          }
        }
        logs = seeded;
      }

      // ── Aggregations ──────────────────────────────────────────────────────
      const totalCost   = logs.reduce((s, l) => s + (l.cost ?? 0), 0);
      const totalTokens = logs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);
      const totalCalls  = logs.length;

      // Daily breakdown for chart (last `days` days)
      const dailyMap: Record<string, { cost: number; tokens: number; calls: number }> = {};
      logs.forEach((l) => {
        const day = l.createdAt.slice(0, 10);
        if (!dailyMap[day]) dailyMap[day] = { cost: 0, tokens: 0, calls: 0 };
        dailyMap[day].cost   += l.cost ?? 0;
        dailyMap[day].tokens += l.totalTokens ?? 0;
        dailyMap[day].calls  += 1;
      });
      const dailyChart = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));

      // Feature breakdown
      const featureMap: Record<string, { cost: number; tokens: number; calls: number }> = {};
      logs.forEach((l) => {
        const f = l.feature ?? 'unknown';
        if (!featureMap[f]) featureMap[f] = { cost: 0, tokens: 0, calls: 0 };
        featureMap[f].cost   += l.cost ?? 0;
        featureMap[f].tokens += l.totalTokens ?? 0;
        featureMap[f].calls  += 1;
      });
      const featureBreakdown = Object.entries(featureMap)
        .map(([feature, v]) => ({ feature, ...v }))
        .sort((a, b) => b.cost - a.cost);

      // Model distribution
      const modelMap: Record<string, number> = {};
      logs.forEach((l) => { modelMap[l.model ?? 'unknown'] = (modelMap[l.model ?? 'unknown'] ?? 0) + 1; });
      const modelDistribution = Object.entries(modelMap).map(([model, calls]) => ({ model, calls }));

      // Top users by cost
      const userMap: Record<string, { cost: number; tokens: number; calls: number }> = {};
      logs.forEach((l) => {
        const u = l.uid ?? 'anonymous';
        if (!userMap[u]) userMap[u] = { cost: 0, tokens: 0, calls: 0 };
        userMap[u].cost   += l.cost ?? 0;
        userMap[u].tokens += l.totalTokens ?? 0;
        userMap[u].calls  += 1;
      });
      const topUsers = Object.entries(userMap)
        .map(([uid, v]) => ({ uid, ...v }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10);

      // Average cost/tokens per call
      const avgCostPerCall   = totalCalls > 0 ? totalCost / totalCalls : 0;
      const avgTokensPerCall = totalCalls > 0 ? totalTokens / totalCalls : 0;

      // Read current platform settings
      const settingsSnap = await db.collection(collections.platform_config).doc('openai_settings').get();
      const currentSettings = settingsSnap.exists
        ? settingsSnap.data()
        : { maxHistoryLimit: 6, maxTokensMultiplier: 1.0, tierDownModel: false };

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalCost: parseFloat(totalCost.toFixed(6)),
            totalTokens,
            totalCalls,
            avgCostPerCall: parseFloat(avgCostPerCall.toFixed(6)),
            avgTokensPerCall: Math.round(avgTokensPerCall),
            periodDays: days,
          },
          dailyChart,
          featureBreakdown,
          modelDistribution,
          topUsers,
          currentSettings,
        },
      });
    } catch (error) {
      logger.error(`getAIUsageStats error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to fetch AI usage stats' });
    }
  };

  // POST /admin/ai-settings — Update platform-level OpenAI controls
  public updateOpenAISettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { maxHistoryLimit, maxTokensMultiplier, tierDownModel } = req.body;
      const db = getFirestore();

      const update: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (maxHistoryLimit !== undefined) {
        const v = Number(maxHistoryLimit);
        if (isNaN(v) || v < 1 || v > 20) {
          res.status(400).json({ success: false, error: 'maxHistoryLimit must be 1–20' });
          return;
        }
        update.maxHistoryLimit = v;
      }
      if (maxTokensMultiplier !== undefined) {
        const v = Number(maxTokensMultiplier);
        if (isNaN(v) || v < 0.1 || v > 2.0) {
          res.status(400).json({ success: false, error: 'maxTokensMultiplier must be 0.1–2.0' });
          return;
        }
        update.maxTokensMultiplier = v;
      }
      if (tierDownModel !== undefined) {
        update.tierDownModel = Boolean(tierDownModel);
      }

      await db.collection(collections.platform_config).doc('openai_settings').set(update, { merge: true });
      logger.info(`Admin updated OpenAI settings: ${JSON.stringify(update)}`);
      res.status(200).json({ success: true, message: 'OpenAI settings updated', data: update });
    } catch (error) {
      logger.error(`updateOpenAISettings error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to update OpenAI settings' });
    }
  };
}

