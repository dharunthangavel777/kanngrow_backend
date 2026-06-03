import { Request, Response } from 'express';
import { getAuth, getFirestore, collections } from '../core/config/firebase.config';
import { logger } from '../core/config/logger.config';
import { emailService } from '../core/utils/email.utils';
import { securityConfig } from '../core/config/security.config';

// In-memory store for OTPs (For MVP only)
// Key: email, Value: { otp: string, expiresAt: number, failedAttempts: number }
const otpStore = new Map<string, { otp: string; expiresAt: number; failedAttempts: number }>();

export class AdminAuthController {
  
  private async logAuthEvent(email: string, action: string, status: string, ip: string, failureReason?: string) {
    try {
      await getFirestore().collection(collections.adminLogs).add({
        email,
        action,
        status,
        ip,
        failureReason: failureReason || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Failed to write admin log: ${(error as Error).message}`);
    }
  }

  private async isLockedOut(email: string): Promise<boolean> {
    try {
      const doc = await getFirestore().collection(collections.adminLockouts).doc(email).get();
      if (!doc.exists) return false;
      const data = doc.data();
      if (data && data.lockedUntil && new Date(data.lockedUntil) > new Date()) {
        return true;
      }
      // Lockout expired, we can clean it up or just ignore it
      return false;
    } catch (error) {
      logger.error(`Failed to check lockout: ${(error as Error).message}`);
      return false;
    }
  }

  private async setLockout(email: string) {
    try {
      const lockedUntil = new Date(Date.now() + securityConfig.adminAuth.LOCKOUT_DURATION_MS).toISOString();
      await getFirestore().collection(collections.adminLockouts).doc(email).set({
        lockedUntil,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Failed to set lockout: ${(error as Error).message}`);
    }
  }

  // POST /admin/auth/send-otp
  public sendOtp = async (req: Request, res: Response): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required' });
        return;
      }

      if (await this.isLockedOut(email)) {
        await this.logAuthEvent(email, 'SEND_OTP', 'FAILED', ip, 'Account is temporarily locked out');
        res.status(403).json({ success: false, message: 'Account is temporarily locked out due to too many failed attempts.' });
        return;
      }

      // Check if email exists in Firebase Auth (pre-registered admins only)
      try {
        await getAuth().getUserByEmail(email);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          await this.logAuthEvent(email, 'SEND_OTP', 'FAILED', ip, 'Unauthorized email');
          res.status(403).json({ success: false, message: 'Unauthorized email' });
          return;
        }
        throw error;
      }

      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP with expiration and attempts
      otpStore.set(email, {
        otp,
        expiresAt: Date.now() + securityConfig.adminAuth.OTP_EXPIRY_MS,
        failedAttempts: 0,
      });

      // Send Real OTP Email
      await emailService.sendOtpEmail(email, otp);

      await this.logAuthEvent(email, 'SEND_OTP', 'SUCCESS', ip);

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
      });
    } catch (error) {
      logger.error(`Send OTP failed: ${(error as Error).message}`);
      res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
  };

  // POST /admin/auth/verify-otp
  public verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        res.status(400).json({ success: false, message: 'Email and OTP are required' });
        return;
      }

      if (await this.isLockedOut(email)) {
        await this.logAuthEvent(email, 'VERIFY_OTP', 'FAILED', ip, 'Account is temporarily locked out');
        res.status(403).json({ success: false, message: 'Account is temporarily locked out due to too many failed attempts.' });
        return;
      }

      const stored = otpStore.get(email);
      if (!stored) {
        await this.logAuthEvent(email, 'VERIFY_OTP', 'FAILED', ip, 'No OTP requested');
        res.status(400).json({ success: false, message: 'No OTP requested for this email' });
        return;
      }

      if (Date.now() > stored.expiresAt) {
        otpStore.delete(email);
        await this.logAuthEvent(email, 'VERIFY_OTP', 'FAILED', ip, 'OTP expired');
        res.status(400).json({ success: false, message: 'OTP has expired' });
        return;
      }

      if (stored.otp !== otp) {
        stored.failedAttempts += 1;
        if (stored.failedAttempts >= securityConfig.adminAuth.MAX_FAILED_ATTEMPTS) {
          otpStore.delete(email);
          await this.setLockout(email);
          await this.logAuthEvent(email, 'VERIFY_OTP', 'LOCKED', ip, 'Max failed attempts exceeded');
          res.status(403).json({ success: false, message: 'Too many failed attempts. Account locked out for 15 minutes.' });
          return;
        } else {
          otpStore.set(email, stored); // Update failed attempts
          await this.logAuthEvent(email, 'VERIFY_OTP', 'FAILED', ip, 'Invalid OTP');
          res.status(400).json({ success: false, message: 'Invalid OTP' });
          return;
        }
      }

      // OTP is valid
      otpStore.delete(email);

      // Fetch Firebase User (must exist since it was validated in sendOtp)
      let uid: string;
      try {
        const userRecord = await getAuth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          await this.logAuthEvent(email, 'VERIFY_OTP', 'FAILED', ip, 'Unauthorized email during verification');
          res.status(403).json({ success: false, message: 'Unauthorized email' });
          return;
        }
        throw error;
      }

      // Ensure user has admin claims
      await getAuth().setCustomUserClaims(uid, { role: 'admin' });

      // Generate Custom Token
      const customToken = await getAuth().createCustomToken(uid);

      await this.logAuthEvent(email, 'VERIFY_OTP', 'SUCCESS', ip);

      res.status(200).json({
        success: true,
        data: { customToken },
      });
    } catch (error) {
      logger.error(`Verify OTP failed: ${(error as Error).message}`);
      // Fallback for local testing if Service Account is missing and createCustomToken fails
      if ((error as Error).message.includes('credential must be used')) {
         res.status(500).json({ 
           success: false, 
           message: 'Firebase Admin SDK not fully configured. Needs Service Account to mint Custom Tokens.' 
         });
         return;
      }
      res.status(500).json({ success: false, message: 'Failed to verify OTP' });
    }
  };
}
