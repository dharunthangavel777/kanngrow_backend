import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { AuthService } from './auth.service';
import { successResponse } from '../../core/utils/responseFormatter';

const authService = new AuthService();

export class AuthController {
  /**
   * POST /api/v1/auth/verify
   * Called by Flutter after Firebase sign-in to register/retrieve the user
   * and get a backend session.
   */
  async verifyAndLogin(req: Request, res: Response): Promise<void> {
    const { uid, email } = req as AuthenticatedRequest;
    const user = await authService.findOrCreateUser(uid, email);
    res.json(successResponse({ user }));
  }

  /**
   * POST /api/v1/auth/logout
   * Client-side logout; server-side we just acknowledge.
   */
  async logout(_req: Request, res: Response): Promise<void> {
    res.json(successResponse({ message: 'Logged out successfully' }));
  }
}
