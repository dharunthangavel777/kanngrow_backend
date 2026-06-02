import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './core/config/env.config';
import { initFirebase } from './core/config/firebase.config';
import { logger } from './core/config/logger.config';
import { errorMiddleware } from './core/middleware/error.middleware';
import { rateLimitMiddleware } from './core/middleware/rateLimit.middleware';

// Route imports
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { profileRoutes } from './modules/profile/profile.routes';
import { chatRoutes } from './chat/chat.routes';
import { workspaceRoutes } from './workspace/workspace.routes';
import { notificationsRoutes } from './notifications/notifications.routes';
import { ideaRoutes } from './ecommerce/idea-engine/idea.routes';
import { validationRoutes } from './ecommerce/validation-engine/validation.routes';
import { businessPlanRoutes } from './ecommerce/business-planner/businessPlan.routes';
import { onboardingRoutes } from './ai/onboarding-engine/onboarding.routes';
import adminRoutes from './admin/admin.routes';
import adminAuthRoutes from './admin/admin.auth.routes';

// ── Initialize Firebase ───────────────────────────────────
initFirebase();

// ── Application Setup ─────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // Trust first proxy (e.g., Railway)

// ── Security & Parsing ────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(','),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(rateLimitMiddleware);

// ── Health Check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'kangrow-ai-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/admin/auth`, adminAuthRoutes);
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, usersRoutes);
app.use(`${API}/profile`, profileRoutes);
app.use(`${API}/chat`, chatRoutes);
app.use(`${API}/workspace`, workspaceRoutes);
app.use(`${API}/notifications`, notificationsRoutes);
app.use(`${API}/ecommerce/ideas`, ideaRoutes);
app.use(`${API}/ecommerce/validate`, validationRoutes);
app.use(`${API}/ecommerce/business-plan`, businessPlanRoutes);
app.use(`${API}/onboarding`, onboardingRoutes);
app.use(`${API}/admin`, adminRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Error Handler ─────────────────────────────────────────
app.use(errorMiddleware);

// ── Start Server ──────────────────────────────────────────
app.listen(env.PORT, () => {
  logger.info(`🚀 Kangrow AI Backend running on http://localhost:${env.PORT}`);
  logger.info(`📋 Environment: ${env.NODE_ENV}`);
  logger.info(`🔥 Firebase Project: ${env.FIREBASE_PROJECT_ID}`);
});

export default app;
// Trigger nodemon reload with fixed missing Q character
