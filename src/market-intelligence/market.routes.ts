import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../core/middleware/auth.middleware';
import { MarketIntelligenceService } from './market.service';
import { successResponse } from '../core/utils/responseFormatter';

const router = Router();
const marketService = new MarketIntelligenceService();

// GET /api/v1/market/alerts — Personalized alerts for user dashboard
router.get('/alerts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const alerts = await marketService.getOpportunityAlerts(uid);
    res.json(successResponse(alerts));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as marketRoutes };
