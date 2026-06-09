import { Router } from 'express';
import { Request, Response } from 'express';
import { MemoryService } from '../../ai/memory/memory.service';
import { DNAService } from '../../ai/dna/dna.service';
import { BusinessPlanService } from './businessPlan.service';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { subscriptionMiddleware, SubscriptionRequest } from '../../core/middleware/subscription.middleware';
import { MODULES } from '../../core/constants';
import { notificationService } from '../../core/services/notification.service';
import { logger } from '../../core/config/logger.config';

const router = Router();
const businessPlanService = new BusinessPlanService();
const memoryService = new MemoryService();
const dnaService = new DNAService();

router.use(authMiddleware);

router.post('/generate', aiRateLimitMiddleware, subscriptionMiddleware, async (req: Request, res: Response) => {
  try {
    const subReq = req as SubscriptionRequest;
    if (!subReq.subscription?.features.marketingStrategy) {
      res.status(403).json({
        success: false,
        error: 'Full Business Plan Generation requires the Premium plan. Please upgrade.'
      });
      return;
    }
    const { uid } = subReq;
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

    const result = await businessPlanService.generateBusinessPlan(uid, profileSummary);

    // Send business plan ready notification
    notificationService.send({
      uid,
      type: 'idea.business_plan_ready',
      title: '📊 Business Plan Ready!',
      body: `Your complete business plan for "${result.plan.title}" is ready. Check it out now!`,
      data: {
        planTitle: result.plan.title,
        planId: result.id
      }
    }).catch(e => logger.warn(`Failed to send business plan notif: ${e.message}`));

    res.json(successResponse(result, [MODULES.BUSINESS_PLANNER, MODULES.ROADMAP_ENGINE]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/roadmap', aiRateLimitMiddleware, subscriptionMiddleware, async (req: Request, res: Response) => {
  try {
    const subReq = req as SubscriptionRequest;
    if (!subReq.subscription?.features.competitorResearch) {
      res.status(403).json({
        success: false,
        error: 'E-commerce roadmaps require the Standard plan or higher. Please upgrade.'
      });
      return;
    }
    const { uid } = subReq;
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

    const goal = ((dna as any)?.goals && (dna as any).goals.length > 0) ? (dna as any).goals[0] : 'Build a profitable store';
    const result = await businessPlanService.generateRoadmap(uid, profileSummary, goal);

    res.json(successResponse(result, [MODULES.ROADMAP_ENGINE, MODULES.BUSINESS_PLANNER]));
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { router as businessPlanRoutes };
