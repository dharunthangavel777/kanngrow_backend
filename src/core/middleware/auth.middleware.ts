import { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/firebase.config';
import { logger } from '../config/logger.config';
import { env } from '../config/env.config';

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
    res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    return;
  }

  const idToken = authHeader.replace('Bearer ', '');

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    (req as AuthenticatedRequest).uid = decodedToken.uid;
    (req as AuthenticatedRequest).email = decodedToken.email;
    (req as AuthenticatedRequest).role = decodedToken.role;
    (req as AuthenticatedRequest).user = decodedToken;
    next();
  } catch (error) {
    logger.warn(`Auth failed: ${(error as Error).message}`);
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}
