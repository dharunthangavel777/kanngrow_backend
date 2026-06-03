import { Router } from 'express';
import { AdminAuthController } from './admin.auth.controller';
import { adminAuthRateLimiter } from '../core/middleware/rateLimit.middleware';

const router = Router();
const authController = new AdminAuthController();

router.post('/send-otp', adminAuthRateLimiter, authController.sendOtp);
router.post('/verify-otp', adminAuthRateLimiter, authController.verifyOtp);

export default router;
