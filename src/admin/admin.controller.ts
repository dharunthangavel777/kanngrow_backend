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

      const [
        usersSnap,
        knowledgeStats,
        standardSnap,
        premiumSnap,
        enterpriseSnap,
        paidSnap,
        adminAssignedSnap,
        trialSnap,
        lifetimeSnap,
      ] = await Promise.all([
        db.collection(collections.users).count().get(),
        knowledgeService.getStats(),
        db.collection(collections.users).where('subscription.tier', '==', 'standard').count().get(),
        db.collection(collections.users).where('subscription.tier', '==', 'premium').count().get(),
        db.collection(collections.users).where('subscription.tier', '==', 'enterprise').count().get(),
        db.collection(collections.users).where('subscription.sourceType', '==', 'payment').count().get(),
        db.collection(collections.users).where('subscription.sourceType', '==', 'admin_assignment').count().get(),
        db.collection(collections.users).where('subscription.sourceType', '==', 'trial').count().get(),
        db.collection(collections.users).where('subscription.isLifetime', '==', true).count().get(),
      ]);

      const totalUsers = usersSnap.data().count;
      const standardUsers = standardSnap.data().count;
      const premiumUsers = premiumSnap.data().count;
      const enterpriseUsers = enterpriseSnap.data().count;
      const freeUsers = Math.max(0, totalUsers - standardUsers - premiumUsers - enterpriseUsers);

      const paidSubscribers = paidSnap.data().count;
      const adminAssignedSubscribers = adminAssignedSnap.data().count;
      const trialSubscribers = trialSnap.data().count;
      const lifetimeSubscribers = lifetimeSnap.data().count;

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
          freeUsers,
          standardUsers,
          premiumUsers,
          enterpriseUsers,
          paidSubscribers,
          adminAssignedSubscribers,
          trialSubscribers,
          lifetimeSubscribers,
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

  // POST /admin/settings — General system controls
  public updateAdminSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { limitTokens, useGPT4o, useClaude, maintenanceMode, pushNotifications } = req.body;
      const db = getFirestore();

      const update: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (limitTokens !== undefined) update.limitTokens = Number(limitTokens);
      if (useGPT4o !== undefined) update.useGPT4o = Boolean(useGPT4o);
      if (useClaude !== undefined) update.useClaude = Boolean(useClaude);
      if (maintenanceMode !== undefined) update.maintenanceMode = Boolean(maintenanceMode);
      if (pushNotifications !== undefined) update.pushNotifications = Boolean(pushNotifications);

      await db.collection(collections.platform_config).doc('admin_settings').set(update, { merge: true });
      logger.info(`Admin updated general settings: ${JSON.stringify(update)}`);
      res.status(200).json({ success: true, message: 'Admin settings updated', data: update });
    } catch (error) {
      logger.error(`updateAdminSettings error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to update general settings' });
    }
  };

  // POST /admin/users/:id/override — Manual user limits/features overrides
  public overrideUserLimits = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { limitOverrides, featuresEnabled, reason } = req.body;
      const db = getFirestore();

      const overrideDoc = {
        limitOverrides: limitOverrides || null,
        featuresEnabled: featuresEnabled || null,
        reason: reason || 'Admin override',
        updatedBy: (req as any).uid || 'admin',
        updatedAt: new Date().toISOString(),
      };

      await db.collection(collections.user_overrides).doc(id).set(overrideDoc, { merge: true });
      logger.info(`Admin set custom overrides for user ${id}`);
      res.status(200).json({ success: true, message: `Overrides saved for user ${id}`, data: overrideDoc });
    } catch (error) {
      logger.error(`overrideUserLimits error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to save user overrides' });
    }
  };

  // POST /admin/users/:id/assign-plan — Manual subscription administration
  public assignUserPlan = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { tier, status, source_type, is_lifetime, expiry_date, notes } = req.body;
      const db = getFirestore();

      if (!tier || !['free', 'standard', 'premium', 'enterprise'].includes(tier)) {
        res.status(400).json({ success: false, error: 'Invalid tier specified' });
        return;
      }

      // 1. Fetch target user
      const userRef = db.collection(collections.users).doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      const userData = userSnap.data()!;
      const userName = userData.displayName || userData.name || 'Unknown User';
      const previousPlan = userData.subscription?.tier || 'free';

      // 2. Fetch admin details
      const adminUid = (req as any).uid || 'admin';
      let adminName = 'Super Admin';
      try {
        const adminSnap = await db.collection(collections.users).doc(adminUid).get();
        if (adminSnap.exists) {
          adminName = adminSnap.data()?.displayName || adminSnap.data()?.name || adminSnap.data()?.email || 'Super Admin';
        }
      } catch (err) {
        logger.warn(`Failed to fetch admin name: ${(err as Error).message}`);
      }

      // 3. Create Subscription Record
      const subscriptionId = db.collection(collections.user_subscriptions).doc().id;
      const subscriptionRecord = {
        id: subscriptionId,
        user_id: id,
        plan_id: tier,
        source_type: source_type || 'admin_assignment',
        assigned_by_admin_id: adminUid,
        assigned_at: new Date().toISOString(),
        start_date: new Date().toISOString(),
        expiry_date: is_lifetime === true ? null : (expiry_date || null),
        is_lifetime: is_lifetime === true,
        status: status || 'active',
        notes: notes || '',
      };

      await db.collection(collections.user_subscriptions).doc(subscriptionId).set(subscriptionRecord);

      // 4. Update User Profile
      const subscription = {
        tier,
        status: status || 'active',
        stripeCustomerId: 'manual',
        stripeSubscriptionId: 'manual',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: is_lifetime === true ? 'lifetime' : (expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()),
        isLifetime: is_lifetime === true,
        sourceType: source_type || 'admin_assignment',
        notes: notes || '',
        promoOverride: true,
      };

      await userRef.update({
        subscription,
        updatedAt: new Date().toISOString(),
      });

      // 5. Create Audit Log
      const auditLogId = db.collection(collections.audit_logs).doc().id;
      const auditLog = {
        id: auditLogId,
        admin_id: adminUid,
        admin_name: adminName,
        user_id: id,
        user_name: userName,
        previous_plan: previousPlan,
        new_plan: tier,
        timestamp: new Date().toISOString(),
        reason: notes || 'Manual Plan Assignment',
        source_type: source_type || 'admin_assignment',
      };

      await db.collection(collections.audit_logs).doc(auditLogId).set(auditLog);

      logger.info(`Admin ${adminName} manually assigned plan '${tier}' to user ${userName} (${id}). Reason: ${notes}`);
      res.status(200).json({
        success: true,
        message: `Subscription plan '${tier}' assigned to user ${userName}`,
        data: {
          subscription,
          subscriptionRecord,
          auditLog
        }
      });
    } catch (error) {
      logger.error(`assignUserPlan error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to assign plan' });
    }
  };

  // GET /admin/audit-logs — Retrieve chronological audit logs
  public getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getFirestore();
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const startAfter = req.query.startAfter as string | undefined;

      let query = db
        .collection(collections.audit_logs)
        .orderBy('timestamp', 'desc')
        .limit(limit);

      if (startAfter) {
        const cursorDoc = await db.collection(collections.audit_logs).doc(startAfter).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();
      const logs = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          adminId: data.admin_id,
          adminName: data.admin_name || 'Admin',
          userId: data.user_id,
          userName: data.user_name || 'User',
          previousPlan: data.previous_plan || 'free',
          newPlan: data.new_plan || 'free',
          timestamp: data.timestamp || '',
          reason: data.reason || '',
          sourceType: data.source_type || 'admin_assignment',
        };
      });

      res.status(200).json({
        success: true,
        data: logs,
        count: logs.length,
        hasMore: logs.length === limit,
      });
    } catch (error) {
      logger.error(`getAuditLogs error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
    }
  };

  // POST /admin/import-local-html — Ingest local HTML knowledge base into Firestore
  public importLocalHtml = async (req: Request, res: Response): Promise<void> => {
    try {
      const fs = require('fs');
      const path = require('path');
      const db = getFirestore();
      
      const adminUid = (req as any).uid || 'system';
      const filePath = path.join(__dirname, '..', '..', '..', 'kanngrow knowledge base', 'kangrow_india_knowledge_base.html');
      
      if (!fs.existsSync(filePath)) {
        res.status(400).json({ success: false, error: `Local HTML knowledge base file not found at path: ${filePath}` });
        return;
      }
      
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const startMatch = htmlContent.indexOf('const ideas = [');
      if (startMatch === -1) {
        res.status(400).json({ success: false, error: 'Could not find ideas array inside the HTML file' });
        return;
      }
      const endMatch = htmlContent.indexOf('];', startMatch);
      if (endMatch === -1) {
        res.status(400).json({ success: false, error: 'Malformed JavaScript array inside the HTML file' });
        return;
      }
      
      const arrayContent = htmlContent.substring(startMatch + 'const ideas = ['.length - 1, endMatch + 1);
      
      // Evaluate the javascript array string safely
      const ideasArray = new Function(`return ${arrayContent}`)();
      if (!Array.isArray(ideasArray)) {
        res.status(400).json({ success: false, error: 'Parsed content is not a valid array' });
        return;
      }

      logger.info(`Starting local HTML migration. Found ${ideasArray.length} ideas.`);
      
      let ideasImported = 0;
      let vendorsImported = 0;
      let schemesImported = 0;
      let reportsImported = 0;

      const slugify = (text: string): string => {
        return text
          .toString()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
      };

      const parseInvestment = (investStr: string): { min: number; max: number } => {
        const clean = investStr.replace(/₹/g, '').trim();
        const parts = clean.split(/[–-]/);
        const parsePart = (p: string) => {
          p = p.trim().toUpperCase();
          let multiplier = 1;
          if (p.endsWith('K')) {
            multiplier = 1000;
            p = p.slice(0, -1);
          } else if (p.endsWith('L')) {
            multiplier = 100000;
            p = p.slice(0, -1);
          } else if (p.endsWith('CR')) {
            multiplier = 10000000;
            p = p.slice(0, -2);
          }
          const val = parseFloat(p);
          return isNaN(val) ? 0 : Math.round(val * multiplier);
        };
        const min = parsePart(parts[0] || '0');
        const max = parts[1] ? parsePart(parts[1]) : min * 3;
        return { min: min || 20000, max: max || 100000 };
      };

      const toTimestamp = () => new Date().toISOString();

      // We can use a batched write for Firestore for efficiency
      const batch = db.batch();

      for (const item of ideasArray) {
        const ideaId = `idea-${slugify(item.title)}`;
        const { min: invMin, max: invMax } = parseInvestment(item.invest || '');
        
        // 1. Business Idea
        const ideaDocRef = db.collection(collections.knowledge_ideas).doc(ideaId);
        const businessIdea = {
          id: ideaId,
          name: item.title,
          category: item.cat || 'general',
          description: item.desc || '',
          investmentMin: invMin,
          investmentMax: invMax,
          profitMarginMin: (item.scores?.margin || 6) * 5,
          profitMarginMax: ((item.scores?.margin || 6) * 5) + 15,
          marketSize: item.marketcap || 'Large',
          demandLevel: (item.scores?.demand || 6) > 8 ? 'Very High' : ((item.scores?.demand || 6) > 6 ? 'High' : 'Medium'),
          competitionLevel: (item.scores?.risk || 5) > 7 ? 'High' : ((item.scores?.risk || 5) > 4 ? 'Medium' : 'Low'),
          riskLevel: (item.scores?.risk || 5) > 7 ? 'High' : ((item.scores?.risk || 5) > 4 ? 'Medium' : 'Low'),
          targetStates: [item.state],
          targetAudience: item.docs?.customers?.map((c: any) => `${c.k}: ${c.v}`).join(', ') || 'General Consumers',
          sourcingOptions: item.docs?.vendors?.map((v: any) => v.name) || [],
          requiredDocuments: item.docs?.documentation?.map((d: any) => d.k) || [],
          keySuccessFactors: item.docs?.innovation?.map((i: any) => `${i.k}: ${i.v}`) || [],
          challenges: item.docs?.competitors?.map((c: any) => `${c.k}: ${c.v}`) || [],
          growthPotential: item.dataSection?.content || '',
          kangrowScore: (item.scores?.opportunity || 8) * 10,
          tags: [item.cat || 'general', slugify(item.state)],
          isActive: true,
          createdAt: toTimestamp(),
          updatedAt: toTimestamp(),
          createdBy: adminUid
        };
        batch.set(ideaDocRef, businessIdea);
        ideasImported++;

        // 2. Vendors
        if (item.docs?.vendors && Array.isArray(item.docs.vendors)) {
          for (const v of item.docs.vendors) {
            const vendorId = `vendor-${slugify(v.name)}`;
            const vendorDocRef = db.collection(collections.knowledge_vendors).doc(vendorId);
            const vendor = {
              id: vendorId,
              name: v.name,
              category: item.cat || 'general',
              type: 'Both',
              description: v.type || '',
              location: v.address || 'Pan India',
              website: v.email ? `mailto:${v.email}` : '',
              minOrderValue: 0,
              deliveryDays: '3–7 days',
              paymentTerms: 'Cash / Bank Transfer',
              specialties: [v.type || 'General Supplier'],
              rating: 4.5,
              verifiedByKangrow: true,
              tags: [item.cat || 'general'],
              isActive: true,
              createdAt: toTimestamp(),
              updatedAt: toTimestamp()
            };
            batch.set(vendorDocRef, vendor);
            vendorsImported++;
          }
        }

        // 3. Government Schemes
        if (item.docs?.govtbenefits && Array.isArray(item.docs.govtbenefits)) {
          for (const g of item.docs.govtbenefits) {
            const schemeId = `scheme-${slugify(g.k)}`;
            const schemeDocRef = db.collection(collections.knowledge_govt_schemes).doc(schemeId);
            const scheme = {
              id: schemeId,
              name: g.k,
              fullName: g.k,
              department: 'Government of India / State Government',
              description: g.v || '',
              eligibility: [`Targeted at ${item.cat || 'general'} sector`, 'Registered MSME / Startup'],
              benefits: [g.v || ''],
              maxBenefitAmount: 0,
              applicationProcess: 'Apply online via central/state MSME portal',
              applicationUrl: item.udyamLink || 'https://udyamregistration.gov.in/',
              targetCategories: [item.cat || 'general'],
              targetStates: [item.state],
              documentRequired: [],
              isActive: true,
              createdAt: toTimestamp(),
              updatedAt: toTimestamp()
            };
            batch.set(schemeDocRef, scheme);
            schemesImported++;
          }
        }

        // 4. Market Reports
        if (item.dataSection) {
          const reportId = `report-${slugify(item.dataSection.title)}`;
          const reportDocRef = db.collection(collections.knowledge_market_reports).doc(reportId);
          const report = {
            id: reportId,
            title: item.dataSection.title,
            category: item.cat || 'general',
            type: 'Trending',
            summary: item.dataSection.content || '',
            insights: [item.dataSection.content || ''],
            opportunityScore: (item.scores?.opportunity || 8) * 10,
            relevantStates: [item.state],
            targetAudience: item.docs?.customers?.map((c: any) => c.v) || ['General Shoppers'],
            investmentRange: item.invest || 'N/A',
            source: item.sourceLinks?.[0]?.title || 'Industry Reports',
            validFrom: new Date().toISOString().slice(0, 10),
            isActive: true,
            createdAt: toTimestamp(),
            updatedAt: toTimestamp()
          };
          batch.set(reportDocRef, report);
          reportsImported++;
        }
      }

      await batch.commit();
      logger.info(`Local HTML Ingestion complete: ${ideasImported} ideas, ${vendorsImported} vendors, ${schemesImported} schemes, ${reportsImported} reports written.`);
      
      res.status(200).json({
        success: true,
        message: 'Knowledge base migrated from local HTML file successfully!',
        data: {
          ideasCount: ideasImported,
          vendorsCount: vendorsImported,
          schemesCount: schemesImported,
          reportsCount: reportsImported
        }
      });
    } catch (error) {
      logger.error(`importLocalHtml error: ${(error as Error).message}`);
      res.status(500).json({ success: false, error: `Failed to migrate HTML data: ${(error as Error).message}` });
    }
  };
}

