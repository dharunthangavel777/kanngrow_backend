import rateLimit from 'express-rate-limit';
import { env } from '../config/env.config';

export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

// Stricter rate limit for AI endpoints (more expensive)
export const aiRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AI rate limit exceeded. Please wait before sending another request.',
  },
});

// Very strict rate limit for Admin Auth to prevent brute force attacks
export const adminAuthRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 requests per `window` (here, per 5 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 5 minutes.',
  },
});
