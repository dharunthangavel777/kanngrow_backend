import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

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

  next();
};
