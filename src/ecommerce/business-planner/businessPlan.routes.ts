import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { ContextBuilder } from '../../ai/context/contextBuilder';
import { ProfileService } from '../../modules/profile/profile.service';
import { MemoryService } from '../../ai/memory/memory.service';
import { BUSINESS_PLAN_PROMPT, ROADMAP_PROMPT } from '../../ai/prompts/roadmap.prompt';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { MODULES } from '../../core/constants';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { generateId, toTimestamp } from '../../core/utils/helpers';

const router = Router();
const ai = new OpenAIProvider();
const profileService = new ProfileService();
const memory = new MemoryService();
const contextBuilder = new ContextBuilder();
const db = getFirestore();

router.use(authMiddleware);

router.post('/generate', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const [profile, facts] = await Promise.all([
    profileService.getProfile(uid),
    memory.getMemoryFacts(uid),
  ]);
  const { profileSummary } = contextBuilder.build(profile, facts);

  const result = await ai.completeJSON<object>({
    messages: [{ role: 'user', content: BUSINESS_PLAN_PROMPT(profileSummary) }],
    responseFormat: 'json',
    maxTokens: 2000,
  });

  // Auto-save to workspace
  const id = generateId();
  await db.collection(collections.users).doc(uid).collection(collections.workspace).doc(id).set({
    id,
    type: 'business_plan',
    data: result,
    createdAt: toTimestamp(),
  });

  res.json(successResponse({ id, plan: result }, [MODULES.BUSINESS_PLANNER, MODULES.ROADMAP_ENGINE]));
});

router.post('/roadmap', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const [profile, facts] = await Promise.all([
    profileService.getProfile(uid),
    memory.getMemoryFacts(uid),
  ]);
  const { profileSummary } = contextBuilder.build(profile, facts);

  const result = await ai.completeJSON<object>({
    messages: [{ role: 'user', content: ROADMAP_PROMPT(profileSummary, profile?.goal || 'Build a profitable store') }],
    responseFormat: 'json',
    maxTokens: 2000,
  });

  const id = generateId();
  await db.collection(collections.users).doc(uid).collection(collections.workspace).doc(id).set({
    id,
    type: 'roadmap',
    data: result,
    createdAt: toTimestamp(),
  });

  res.json(successResponse({ id, roadmap: result }, [MODULES.ROADMAP_ENGINE, MODULES.BUSINESS_PLANNER]));
});

export { router as businessPlanRoutes };
