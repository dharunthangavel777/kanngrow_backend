import { Router, Request, Response } from 'express';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeSync } from './knowledge.sync';
import { adminMiddleware } from '../core/middleware/admin.middleware';
import { authMiddleware } from '../core/middleware/auth.middleware';

const router = Router();
const knowledgeService = new KnowledgeService();

// ── All admin write routes require admin auth ──────────────────────────────────

// ── BUSINESS IDEAS ─────────────────────────────────────────────────────────────

// GET /api/v1/knowledge/ideas — Admin: list all. User: filter by budget/state
router.get('/ideas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, investmentMax, state, demandLevel, limit } = req.query;
    const ideas = await knowledgeService.getIdeas({
      category: category as string,
      investmentMax: investmentMax ? Number(investmentMax) : undefined,
      state: state as string,
      demandLevel: demandLevel as string,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data: ideas, count: ideas.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/v1/knowledge/ideas/:id
router.get('/ideas/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const idea = await knowledgeService.getIdeaById(req.params.id);
    if (!idea) return res.status(404).json({ success: false, error: 'Idea not found' });
    res.json({ success: true, data: idea });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/v1/knowledge/ideas — Admin only
router.post('/ideas', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const adminUid = (req as any).uid || 'system';
    const idea = await knowledgeService.createIdea(req.body, adminUid);
    res.status(201).json({ success: true, data: idea });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/v1/knowledge/ideas/:id — Admin only
router.put('/ideas/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.updateIdea(req.params.id, req.body);
    res.json({ success: true, message: 'Idea updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/v1/knowledge/ideas/:id — Admin only (soft delete)
router.delete('/ideas/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.deleteIdea(req.params.id);
    res.json({ success: true, message: 'Idea deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── VENDORS ────────────────────────────────────────────────────────────────────

router.get('/vendors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const vendors = await knowledgeService.getVendors(category as string);
    res.json({ success: true, data: vendors, count: vendors.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/vendors', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const vendor = await knowledgeService.createVendor(req.body);
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/vendors/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.updateVendor(req.params.id, req.body);
    res.json({ success: true, message: 'Vendor updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/vendors/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.deleteVendor(req.params.id);
    res.json({ success: true, message: 'Vendor deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── GOVT SCHEMES ──────────────────────────────────────────────────────────────

router.get('/schemes', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { state, category } = req.query;
    const schemes = await knowledgeService.getSchemes({
      state: state as string,
      category: category as string,
    });
    res.json({ success: true, data: schemes, count: schemes.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/schemes', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const scheme = await knowledgeService.createScheme(req.body);
    res.status(201).json({ success: true, data: scheme });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/schemes/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.updateScheme(req.params.id, req.body);
    res.json({ success: true, message: 'Scheme updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/schemes/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.deleteScheme(req.params.id);
    res.json({ success: true, message: 'Scheme deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── MARKET REPORTS ────────────────────────────────────────────────────────────

router.get('/market', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const reports = await knowledgeService.getMarketReports(
      type as 'Trending' | 'Seasonal' | 'Emerging' | 'Declining' | undefined,
    );
    res.json({ success: true, data: reports, count: reports.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/market', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const report = await knowledgeService.createMarketReport(req.body);
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/market/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.updateMarketReport(req.params.id, req.body);
    res.json({ success: true, message: 'Market report updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/market/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    await knowledgeService.deleteMarketReport(req.params.id);
    res.json({ success: true, message: 'Market report deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── STATS (Admin dashboard) ───────────────────────────────────────────────────

router.get('/stats', authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const stats = await knowledgeService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/v1/knowledge/sync — Sync knowledge base from website docs.html (Admin only)
router.post('/sync', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const adminUid = (req as any).uid || 'system';
    const syncService = new KnowledgeSync();
    const result = await syncService.syncWebsiteDocs('https://kanngrow.com/docs.html', adminUid);
    res.json({
      success: true,
      message: 'Knowledge base synced successfully from website!',
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as knowledgeRoutes };
