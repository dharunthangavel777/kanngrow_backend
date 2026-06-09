import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authMiddleware } from '../core/middleware/auth.middleware';
import { adminMiddleware } from '../core/middleware/admin.middleware';

const router = Router();
const adminController = new AdminController();

// All admin routes should be protected.
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard overview
router.get('/dashboard', adminController.getDashboardStats);

// User management
router.get('/users', adminController.getUsers);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/restore', adminController.restoreUser);
router.delete('/users/:id', adminController.deleteUser);

// Platform settings / broadcasts
router.post('/broadcast', adminController.sendBroadcast);
router.post('/email-broadcast', adminController.sendEmailBroadcast);
router.post('/settings', adminController.updateAdminSettings);

// ── User Specific SaaS Overrides ──────────────────────────
router.post('/users/:id/override', adminController.overrideUserLimits);
router.post('/users/:id/assign-plan', adminController.assignUserPlan);
router.get('/audit-logs', adminController.getAuditLogs);

// ── AI Usage Tracking & Cost Controls ─────────────────────
router.get('/ai-usage', adminController.getAIUsageStats);
router.post('/ai-settings', adminController.updateOpenAISettings);
router.get('/ai-logs', adminController.getAILogs);

// ── Subscription Plans Configuration ──────────────────────
router.get('/plans', adminController.getSubscriptionPlans);
router.put('/plans/:id', adminController.updateSubscriptionPlan);

// ── Platform Context (V2 Pins) ─────────────────────────────
router.post('/platform-context', adminController.managePlatformContext);

export default router;
