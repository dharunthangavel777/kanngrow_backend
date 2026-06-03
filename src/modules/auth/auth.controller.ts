import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { AuthService } from './auth.service';
import { successResponse, errorResponse } from '../../core/utils/responseFormatter';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../core/config/env.config';
import { getAuth } from 'firebase-admin/auth';
import { logger } from '../../core/config/logger.config';

const authService = new AuthService();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export class AuthController {
  /**
   * POST /api/v1/auth/google
   * Hybrid auth flow: Verify Google idToken, find/create Firebase user, return Custom Token.
   */
  async verifyGoogleAuth(req: Request, res: Response): Promise<void> {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        res.status(400).json(errorResponse('Missing idToken'));
        return;
      }

      // 1. Verify Google OAuth token cryptographically
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      
      if (!payload || !payload.email) {
        res.status(401).json(errorResponse('Invalid Google token payload'));
        return;
      }

      const { email, name, sub: googleId } = payload;
      let uid: string;

      // 2. Lookup Firebase user by email, or create if missing
      try {
        const userRecord = await getAuth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          logger.info(`Creating new Firebase user for Google account: ${email}`);
          const newUserRecord = await getAuth().createUser({
            email,
            displayName: name,
            emailVerified: true, // Google verifies emails
          });
          uid = newUserRecord.uid;
        } else {
          throw error;
        }
      }

      // 3. Sync to Firestore using existing service
      const user = await authService.findOrCreateUser(uid, email);

      // 4. Mint a Firebase Custom Token for the client to use
      const customToken = await getAuth().createCustomToken(uid);

      res.json(successResponse({ customToken, user }));
    } catch (error: any) {
      logger.error(`Google auth verification failed: ${error.message}`);
      res.status(401).json(errorResponse('Invalid Google authentication'));
    }
  }

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
