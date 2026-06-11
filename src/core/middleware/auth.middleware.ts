import { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/firebase.config';
import { logger } from '../config/logger.config';
import { env } from '../config/env.config';
import { AppError } from './error.middleware';

export interface AuthenticatedRequest extends Request {
  uid: string;
  email?: string;
  role?: string;
  user?: any;
}

/**
 * Verifies the Firebase ID token sent in the Authorization header.
 * Flutter sends: Authorization: Bearer <idToken>
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Please log in to continue.', 401, 'ERR_AUTH_UNAUTHORIZED', 'USER_OPERATIONAL', 'ROUTE_LOGIN', false));
    return;
  }

  const idToken = authHeader.replace('Bearer ', '');

  // Development bypass (only if specifically enabled and token is mock-token)
  if (env.NODE_ENV === 'development' && idToken === 'mock-token') {
    (req as AuthenticatedRequest).uid = 'dev_user_123';
    next();
    return;
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    (req as AuthenticatedRequest).uid = decodedToken.uid;
    (req as AuthenticatedRequest).email = decodedToken.email;
    (req as AuthenticatedRequest).role = decodedToken.role;
    (req as AuthenticatedRequest).user = decodedToken;
    next();
  } catch (error) {
    logger.warn(`Auth failed: ${(error as Error).message}`);
    next(new AppError('Your session has expired. Please log in again.', 401, 'ERR_AUTH_EXPIRED', 'USER_OPERATIONAL', 'ROUTE_LOGIN', false));
  }
}
