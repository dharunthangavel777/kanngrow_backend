import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { IdeaGeneratorService } from './generator.service';
import { successResponse } from '../../core/utils/responseFormatter';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../../core/middleware/rateLimit.middleware';
import { subscriptionMiddleware } from '../../core/middleware/subscription.middleware';
import { MODULES } from '../../core/constants';
import { notificationService } from '../../core/services/notification.service';
import { logger } from '../../core/config/logger.config';

const router = Router();
const service = new IdeaGeneratorService();

router.use(authMiddleware);

// Generate new ideas
router.post('/generate', aiRateLimitMiddleware, subscriptionMiddleware, async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const { prompt } = req.body as { prompt?: string };
  const ideas = await service.generateIdeas(uid, prompt);

  notificationService.send({
    uid,
    type: 'idea.generated',
    title: '💡 Business Ideas Generated!',
    body: `We've generated ${ideas.length} custom business ideas based on your DNA.`,
    data: {
      count: String(ideas.length),
      ideaNames: ideas.map(i => i.name).join(', ')
    }
  }).catch((e) => logger.warn(`Failed to send idea.generated notif: ${e.message}`));

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
