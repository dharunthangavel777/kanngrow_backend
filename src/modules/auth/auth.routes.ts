import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

// All auth routes require a valid Firebase ID token
router.post('/verify', authMiddleware, (req, res) => controller.verifyAndLogin(req, res));
router.post('/logout', authMiddleware, (req, res) => controller.logout(req, res));

export { router as authRoutes };
