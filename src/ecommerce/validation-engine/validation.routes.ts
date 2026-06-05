import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { ContextBuilder } from '../../ai/context/contextBuilder';
import { ProfileService } from '../../modules/profile/profile.service';
import { MemoryService } from '../../ai/memory/memory.service';
import { ValidationService } from './validation.service';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { MODULES } from '../../core/constants';

const router = Router();
const validationService = new ValidationService();
const profileService = new ProfileService();
const memory = new MemoryService();
const contextBuilder = new ContextBuilder();

router.use(authMiddleware);

router.post('/product', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const { productName } = req.body as { productName: string };

    const [profile, facts] = await Promise.all([
      profileService.getProfile(uid),
      memory.getMemoryFacts(uid),
    ]);
    const { profileSummary } = contextBuilder.build(profile, facts);

    const result = await validationService.validateProduct(uid, productName, profileSummary);

    res.json(successResponse(result, [MODULES.VALIDATION_ENGINE, MODULES.COMPETITOR_ANALYSIS]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/competitors', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const { niche } = req.body as { niche: string };

    const [profile, facts] = await Promise.all([
      profileService.getProfile(uid),
      memory.getMemoryFacts(uid),
    ]);
    const { profileSummary } = contextBuilder.build(profile, facts);

    const result = await validationService.analyzeCompetitors(uid, niche, profileSummary);

    res.json(successResponse(result, [MODULES.COMPETITOR_ANALYSIS, MODULES.MARKET_INTELLIGENCE]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as validationRoutes };
