import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { IdeaGeneratorService } from './generator.service';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { MODULES } from '../../core/constants';

const router = Router();
const service = new IdeaGeneratorService();

router.use(authMiddleware);

// Generate new ideas
router.post('/generate', aiRateLimitMiddleware, async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const { prompt } = req.body as { prompt?: string };
  const ideas = await service.generateIdeas(uid, prompt);
  res.json(successResponse({ ideas }, [MODULES.IDEA_ENGINE, MODULES.MARKET_INTELLIGENCE]));
});

// Save a specific idea to workspace
router.post('/save', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const idea = await service.saveIdea(uid, req.body);
  res.json(successResponse({ idea }));
});

// Get saved ideas
router.get('/saved', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const ideas = await service.getSavedIdeas(uid);
  res.json(successResponse({ ideas }));
});

// Delete a saved idea
router.delete('/saved/:ideaId', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const { ideaId } = req.params;
  await service.deleteIdea(uid, ideaId);
  res.json(successResponse({ message: 'Idea deleted successfully' }));
});

export { router as ideaRoutes };
