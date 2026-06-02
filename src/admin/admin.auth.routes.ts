import { Router } from 'express';
import { AdminAuthController } from './admin.auth.controller';

const router = Router();
const authController = new AdminAuthController();

router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);

export default router;
