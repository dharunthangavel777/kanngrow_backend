import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { ContextBuilder } from '../../ai/context/contextBuilder';
import { ProfileService } from '../../modules/profile/profile.service';
import { MemoryService } from '../../ai/memory/memory.service';
import { VALIDATION_PROMPT, COMPETITOR_ANALYSIS_PROMPT } from '../../ai/prompts/validation.prompt';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { MODULES } from '../../core/constants';

const router = Router();
const ai = new OpenAIProvider();
const profileService = new ProfileService();
const memory = new MemoryService();
const contextBuilder = new ContextBuilder();

router.use(authMiddleware);

router.post('/product', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const { productName } = req.body as { productName: string };

  const [profile, facts] = await Promise.all([
    profileService.getProfile(uid),
    memory.getMemoryFacts(uid),
  ]);
  const { profileSummary } = contextBuilder.build(profile, facts);

  const result = await ai.completeJSON<object>({
    messages: [{ role: 'user', content: VALIDATION_PROMPT(productName, profileSummary) }],
    responseFormat: 'json',
    maxTokens: 1500,
  });

  res.json(successResponse(result, [MODULES.VALIDATION_ENGINE, MODULES.COMPETITOR_ANALYSIS]));
});

router.post('/competitors', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const { niche } = req.body as { niche: string };

  const [profile, facts] = await Promise.all([
    profileService.getProfile(uid),
    memory.getMemoryFacts(uid),
  ]);
  const { profileSummary } = contextBuilder.build(profile, facts);

  const result = await ai.completeJSON<object>({
    messages: [{ role: 'user', content: COMPETITOR_ANALYSIS_PROMPT(niche, profileSummary) }],
    responseFormat: 'json',
    maxTokens: 1500,
  });

  res.json(successResponse(result, [MODULES.COMPETITOR_ANALYSIS, MODULES.MARKET_INTELLIGENCE]));
});

export { router as validationRoutes };
