import { Router } from 'express';
import { OnboardingController } from './onboarding.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { subscriptionMiddleware } from '../../core/middleware/subscription.middleware';

const router = Router();
const controller = new OnboardingController();

router.use(authMiddleware);

router.post('/next-question', subscriptionMiddleware, (req, res, next) => controller.getNextQuestion(req, res, next));
router.post('/complete', (req, res, next) => controller.completeOnboarding(req, res, next));

export { router as onboardingRoutes };
