import { Router } from 'express';
import { OnboardingController } from './onboarding.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { subscriptionMiddleware } from '../../core/middleware/subscription.middleware';

const router = Router();
const controller = new OnboardingController();

router.use(authMiddleware);

router.post('/next-question', subscriptionMiddleware, (req, res) => controller.getNextQuestion(req, res));
router.post('/complete', (req, res) => controller.completeOnboarding(req, res));

export { router as onboardingRoutes };
