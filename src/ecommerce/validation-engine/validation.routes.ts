import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { MemoryService } from '../../ai/memory/memory.service';
import { DNAService } from '../../ai/dna/dna.service';
import { ValidationService } from './validation.service';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { subscriptionMiddleware, SubscriptionRequest } from '../../core/middleware/subscription.middleware';
import { MODULES } from '../../core/constants';

const router = Router();
const validationService = new ValidationService();
const memoryService = new MemoryService();
const dnaService = new DNAService();

router.use(authMiddleware);

router.post('/product', aiRateLimitMiddleware, subscriptionMiddleware, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const { productName } = req.body as { productName: string };

    const [dna, memoryTiers] = await Promise.all([
      dnaService.getOrCreateDNA(uid),
      memoryService.getMemoryTiers(uid),
    ]);

    const stageMap: Record<string, string> = {
      idea: 'Just exploring — no product chosen yet',
      validating: 'Has an idea, checking if it\'s viable',
      starting: 'Ready to start, needs execution guidance',
      growing: 'Already selling, wants to grow faster',
      scaling: 'Established, wants to scale',
    };
    const stageCtx = stageMap[dna?.businessStage ?? 'idea'] ?? 'Exploring';
    const stateCtx = dna?.state ? `from ${dna.state}` : 'in India';
    const budgetCtx = dna?.budgetLabel ? `Budget: ${dna.budgetLabel}` : '';
    const riskCtx = dna?.riskTolerance ? `Prefers ${dna.riskTolerance}-risk.` : '';
    const nicheCtx = dna?.niche ? `Focus: ${dna.niche}.` : '';
    const storyCtx = memoryTiers.longTerm?.userStory || '';
    const factsCtx = memoryTiers.working.slice(0, 8).map(f => f.fact).join(', ');

    const profileSummary = `Founder is ${stageCtx} ${stateCtx}. ${nicheCtx} ${budgetCtx} ${riskCtx} Journey: ${storyCtx}. Working details: ${factsCtx}`;

    const result = await validationService.validateProduct(uid, productName, profileSummary);

    res.json(successResponse(result, [MODULES.VALIDATION_ENGINE, MODULES.COMPETITOR_ANALYSIS]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/competitors', aiRateLimitMiddleware, subscriptionMiddleware, async (req: Request, res: Response) => {
  try {
    const subReq = req as SubscriptionRequest;
    if (!subReq.subscription?.features.competitorResearch) {
      res.status(403).json({
        success: false,
        error: 'Competitor research is not supported in your current plan. Please upgrade to Standard or higher.'
      });
      return;
    }
    const { uid } = subReq;
    const { niche } = req.body as { niche: string };

    const [dna, memoryTiers] = await Promise.all([
      dnaService.getOrCreateDNA(uid),
      memoryService.getMemoryTiers(uid),
    ]);

    const stageMap: Record<string, string> = {
      idea: 'Just exploring — no product chosen yet',
      validating: 'Has an idea, checking if it\'s viable',
      starting: 'Ready to start, needs execution guidance',
      growing: 'Already selling, wants to grow faster',
      scaling: 'Established, wants to scale',
    };
    const stageCtx = stageMap[dna?.businessStage ?? 'idea'] ?? 'Exploring';
    const stateCtx = dna?.state ? `from ${dna.state}` : 'in India';
    const budgetCtx = dna?.budgetLabel ? `Budget: ${dna.budgetLabel}` : '';
    const riskCtx = dna?.riskTolerance ? `Prefers ${dna.riskTolerance}-risk.` : '';
    const nicheCtx = dna?.niche ? `Focus: ${dna.niche}.` : '';
    const storyCtx = memoryTiers.longTerm?.userStory || '';
    const factsCtx = memoryTiers.working.slice(0, 8).map(f => f.fact).join(', ');

    const profileSummary = `Founder is ${stageCtx} ${stateCtx}. ${nicheCtx} ${budgetCtx} ${riskCtx} Journey: ${storyCtx}. Working details: ${factsCtx}`;

    const result = await validationService.analyzeCompetitors(uid, niche, profileSummary);

    res.json(successResponse(result, [MODULES.COMPETITOR_ANALYSIS, MODULES.MARKET_INTELLIGENCE]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as validationRoutes };
