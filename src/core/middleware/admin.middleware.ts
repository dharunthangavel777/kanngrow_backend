import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { getAuth } from '../config/firebase.config';
import { logger } from '../config/logger.config';

export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const role = authReq.user?.role || authReq.role;

  if (role !== 'admin' && role !== 'super_admin') {
    res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    return;
  }

  // Quality check: Ensure the session has not been revoked
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.replace('Bearer ', '');
    try {
      // Force checking against Firebase backend to ensure the token isn't revoked
      await getAuth().verifyIdToken(idToken, true);
    } catch (error) {
      logger.warn(`Admin session revoked or invalid: ${(error as Error).message}`);
      res.status(401).json({ success: false, message: 'Unauthorized: Session revoked or invalid' });
      return;
    }
  }

  next();
};
