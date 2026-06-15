import { Router } from 'express';
import { UsersController } from './users.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';

const router = Router();
const controller = new UsersController();

router.use(authMiddleware);

router.get('/me', (req, res, next) => controller.getMe(req, res, next));
router.patch('/me', (req, res, next) => controller.updateMe(req, res, next));
router.delete('/me', (req, res, next) => controller.deleteMe(req, res, next));

export { router as usersRoutes };
