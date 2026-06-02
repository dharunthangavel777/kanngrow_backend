import { Router } from 'express';
import { ProfileController } from './profile.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';

const router = Router();
const controller = new ProfileController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.getProfile(req, res));
router.post('/', (req, res) => controller.upsertProfile(req, res));
router.patch('/', (req, res) => controller.upsertProfile(req, res));

export { router as profileRoutes };
