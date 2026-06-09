import { Router } from 'express';
import { Request, Response } from 'express';
import { authMiddleware } from '../core/middleware/auth.middleware';
import { subscriptionMiddleware, SubscriptionRequest } from '../core/middleware/subscription.middleware';
import { MarketIntelligenceService } from './market.service';
import { successResponse } from '../core/utils/responseFormatter';

const router = Router();
const marketService = new MarketIntelligenceService();

// GET /api/v1/market/alerts — Personalized alerts for user dashboard
router.get('/alerts', authMiddleware, subscriptionMiddleware, async (req: Request, res: Response) => {
  try {
    const subReq = req as SubscriptionRequest;
    if (subReq.subscription && !subReq.subscription.features.trendAnalysis) {
      res.status(403).json({
        success: false,
        error: 'Trend analysis and market alerts are disabled on your current plan. Please upgrade.'
      });
      return;
    }
    const { uid } = subReq;
    const alerts = await marketService.getOpportunityAlerts(uid);
    res.json(successResponse(alerts));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as marketRoutes };
