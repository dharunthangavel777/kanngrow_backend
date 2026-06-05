import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { ContextBuilder } from '../../ai/context/contextBuilder';
import { ProfileService } from '../../modules/profile/profile.service';
import { MemoryService } from '../../ai/memory/memory.service';
import { BusinessPlanService } from './businessPlan.service';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { MODULES } from '../../core/constants';

const router = Router();
const businessPlanService = new BusinessPlanService();
const profileService = new ProfileService();
const memory = new MemoryService();
const contextBuilder = new ContextBuilder();

router.use(authMiddleware);

router.post('/generate', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const [profile, facts] = await Promise.all([
      profileService.getProfile(uid),
      memory.getMemoryFacts(uid),
    ]);
    const { profileSummary } = contextBuilder.build(profile, facts);

    const result = await businessPlanService.generateBusinessPlan(uid, profileSummary);

    res.json(successResponse(result, [MODULES.BUSINESS_PLANNER, MODULES.ROADMAP_ENGINE]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/roadmap', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const [profile, facts] = await Promise.all([
      profileService.getProfile(uid),
      memory.getMemoryFacts(uid),
    ]);
    const { profileSummary } = contextBuilder.build(profile, facts);

    const goal = profile?.goal || 'Build a profitable store';
    const result = await businessPlanService.generateRoadmap(uid, profileSummary, goal);

    res.json(successResponse(result, [MODULES.ROADMAP_ENGINE, MODULES.BUSINESS_PLANNER]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as businessPlanRoutes };
