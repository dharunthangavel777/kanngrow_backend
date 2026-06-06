import { Router } from 'express';
import { BillingController } from './billing.controller';
import { authMiddleware } from '../../core/middleware/auth.middleware';

const router = Router();
const controller = new BillingController();

// Checkout session creation (requires user auth)
router.post('/checkout', authMiddleware, controller.createCheckoutSession);

// Public webhook endpoint (no auth middleware, signature checked via Stripe)
router.post('/webhooks', controller.handleWebhook);

export { router as billingRoutes };
