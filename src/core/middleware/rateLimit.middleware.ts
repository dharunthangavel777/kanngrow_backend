import rateLimit from 'express-rate-limit';
import { env } from '../config/env.config';
import { errorResponse } from '../utils/responseFormatter';

const isDev = env.NODE_ENV === 'development';

const keyGenerator = (req: any) => {
  return req.uid || req.ip || 'anonymous';
};

export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 900000,
  max: 10000, // Generous limit to prevent 429 during intense onboarding
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: errorResponse({
    type: 'USER_OPERATIONAL',
    code: 'ERR_RATE_LIMIT',
    user_message: 'You are doing that too fast. Please wait a moment.',
    next_action: 'WAIT',
    retryable: false
  }),
});

// Stricter rate limit for AI endpoints (more expensive)
export const aiRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // Generous limit for AI endpoints
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: errorResponse({
    type: 'USER_OPERATIONAL',
    code: 'ERR_RATE_LIMIT_AI',
    user_message: 'Our AI is resting! Please wait a minute before generating more content.',
    next_action: 'WAIT',
    retryable: false
  }),
});

// Very strict rate limit for Admin Auth to prevent brute force attacks
export const adminAuthRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isDev ? 1000 : 10, // Limit each IP to 10 requests per `window` (here, per 5 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: errorResponse({
    type: 'USER_OPERATIONAL',
    code: 'ERR_RATE_LIMIT_AUTH',
    user_message: 'Too many authentication attempts from this IP, please try again after 5 minutes.',
    next_action: 'WAIT',
    retryable: false
  }),
});
