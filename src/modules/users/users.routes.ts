import { Router } from 'express';
import { UsersController } from './users.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';

const router = Router();
const controller = new UsersController();

router.use(authMiddleware);

router.get('/me', (req, res) => controller.getMe(req, res));
router.patch('/me', (req, res) => controller.updateMe(req, res));
router.delete('/me', (req, res) => controller.deleteMe(req, res));

export { router as usersRoutes };
