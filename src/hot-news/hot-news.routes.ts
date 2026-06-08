import { Router, Request, Response } from 'express';
import { authMiddleware }  from '../core/middleware/auth.middleware';
import { adminMiddleware } from '../core/middleware/admin.middleware';
import { hotNewsService }  from './hot-news.service';
import { runHotNewsJob }   from './hot-news.job';
import { getFirestore, collections } from '../core/config/firebase.config';
import { DNAService }      from '../ai/dna/dna.service';
import { logger }          from '../core/config/logger.config';

const router     = Router();
const dnaService = new DNAService();

// All hot-news admin routes require admin auth
router.use(authMiddleware);
router.use(adminMiddleware);

// ── GET /admin/hot-news/settings ─────────────────────────────────────────────
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await hotNewsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    logger.error(`[HotNews Routes] getSettings error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch Hot News settings' });
  }
});

// ── POST /admin/hot-news/settings ────────────────────────────────────────────
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const {
      globalEnabled,
      enabledTiers,
      tierSettings,
      maxUsersPerRun,
      delayBetweenUsersMs,
    } = req.body;

    const update: Record<string, unknown> = {};
    if (globalEnabled     !== undefined) update.globalEnabled     = Boolean(globalEnabled);
    if (Array.isArray(enabledTiers))     update.enabledTiers      = enabledTiers;
    if (tierSettings      !== undefined) update.tierSettings      = tierSettings;
    if (maxUsersPerRun    !== undefined) update.maxUsersPerRun    = Number(maxUsersPerRun);
    if (delayBetweenUsersMs !== undefined) update.delayBetweenUsersMs = Number(delayBetweenUsersMs);

    await hotNewsService.saveSettings(update);
    logger.info(`[HotNews Routes] Settings updated: ${JSON.stringify(update)}`);
    res.json({ success: true, message: 'Hot News settings updated', data: update });
  } catch (err) {
    logger.error(`[HotNews Routes] saveSettings error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update Hot News settings' });
  }
});

// ── GET /admin/hot-news/stats ────────────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const stats = await hotNewsService.getDeliveryStats(days);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error(`[HotNews Routes] getStats error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch Hot News stats' });
  }
});

// ── GET /admin/hot-news/logs ─────────────────────────────────────────────────
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const db    = getFirestore();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const days  = Math.min(Number(req.query.days)  || 7,  90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const snap = await db
      .collection(collections.openai_usage_logs)
      .where('feature', '==', 'hot-news')
      .where('createdAt', '>=', cutoff)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const logs = snap.docs.map(d => d.data());
    res.json({ success: true, data: logs, count: logs.length });
  } catch (err) {
    logger.error(`[HotNews Routes] getLogs error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch delivery logs' });
  }
});

// ── POST /admin/hot-news/trigger/:uid ────────────────────────────────────────
// Manually trigger Hot News generation for a single user (admin test/override)
router.post('/trigger/:uid', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const db      = getFirestore();

    // Fetch user data
    const userSnap = await db.collection(collections.users).doc(uid).get();
    if (!userSnap.exists) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const userData = userSnap.data()!;
    const tier     = userData?.subscription?.tier as string || 'standard';

    // Get settings for this tier
    const settings   = await hotNewsService.getSettings();
    const tierConfig = (settings.tierSettings as Record<string, { enabled: boolean; itemCount: number; model: string }>)[tier];

    if (!tierConfig) {
      res.status(400).json({ success: false, error: `No tier config found for tier: ${tier}` });
      return;
    }

    // Get or create DNA
    const dna = await dnaService.getOrCreateDNA(uid);

    // Force send (skip dedup check for admin trigger)
    const result = await hotNewsService.generateAndSendForUser(
      uid,
      dna,
      tier,
      tierConfig.model,
      tierConfig.itemCount,
    );

    if (result.success) {
      logger.info(`[HotNews Routes] Admin manually triggered Hot News for uid=${uid}`);
      res.json({ success: true, message: `Hot News generated and sent for user ${uid}` });
    } else {
      res.status(500).json({ success: false, error: 'Generation failed — check server logs' });
    }
  } catch (err) {
    logger.error(`[HotNews Routes] trigger error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to trigger Hot News' });
  }
});

// ── POST /admin/hot-news/run-job ─────────────────────────────────────────────
// Manually fire the full daily job (admin can run it on-demand)
router.post('/run-job', async (req: Request, res: Response) => {
  try {
    const force = req.body.force === true || req.query.force === 'true';
    logger.info(`[HotNews Routes] Admin manually triggered full Hot News job (force=${force})`);
    // Run in background — don't await (it can take minutes for large user bases)
    runHotNewsJob(force).catch(err =>
      logger.error(`[HotNews Routes] Manual job error: ${(err as Error).message}`)
    );
    res.json({ success: true, message: `Hot News job started in background (force=${force})` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to start job' });
  }
});

export default router;
