import { Router } from 'express';
import { ChatController } from './chat.controller';
import { authMiddleware } from '../core/middleware/auth.middleware';
import { aiRateLimitMiddleware } from '../core/middleware/rateLimit.middleware';

const router = Router();
const controller = new ChatController();

router.use(authMiddleware);

router.get('/sessions', (req, res) => controller.getSessions(req, res));
router.post('/sessions', (req, res) => controller.createSession(req, res));
router.get('/sessions/:sessionId/messages', (req, res) => controller.getMessages(req, res));
router.post('/sessions/:sessionId/messages', aiRateLimitMiddleware, (req, res) =>
  controller.sendMessage(req, res),
);

export { router as chatRoutes };
