import { Router } from 'express';
import { OnboardingController } from './onboarding.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';

const router = Router();
const controller = new OnboardingController();

router.use(authMiddleware);

router.post('/next-question', (req, res) => controller.getNextQuestion(req, res));
router.post('/complete', (req, res) => controller.completeOnboarding(req, res));

export { router as onboardingRoutes };
