import { Request, Response } from 'express';
import { getAuth } from '../core/config/firebase.config';
import { logger } from '../core/config/logger.config';
import { emailService } from '../core/utils/email.utils';

// In-memory store for OTPs (For MVP only)
// Key: email, Value: { otp: string, expiresAt: number }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

export class AdminAuthController {
  
  // POST /admin/auth/send-otp
  public sendOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required' });
        return;
      }

      // Check if email belongs to an admin
      // MOCK: Allow any email containing '@kangrow.ai' or explicit admin emails
      if (!email.includes('@kangrow.ai') && email !== 'dharuncod@gmail.com') {
        res.status(403).json({ success: false, message: 'Unauthorized email' });
        return;
      }

      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP with 5-minute expiration
      otpStore.set(email, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      // Send Real OTP Email (falls back to MOCK if no SMTP config)
      await emailService.sendOtpEmail(email, otp);

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
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        res.status(400).json({ success: false, message: 'Email and OTP are required' });
        return;
      }

      const stored = otpStore.get(email);
      if (!stored) {
        res.status(400).json({ success: false, message: 'No OTP requested for this email' });
        return;
      }

      if (Date.now() > stored.expiresAt) {
        otpStore.delete(email);
        res.status(400).json({ success: false, message: 'OTP has expired' });
        return;
      }

      if (stored.otp !== otp) {
        res.status(400).json({ success: false, message: 'Invalid OTP' });
        return;
      }

      // OTP is valid
      otpStore.delete(email);

      // Fetch or Create Firebase User
      let uid: string;
      try {
        const userRecord = await getAuth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          const newUser = await getAuth().createUser({ email });
          uid = newUser.uid;
        } else {
          throw error;
        }
      }

      // Ensure user has admin claims
      await getAuth().setCustomUserClaims(uid, { role: 'admin' });

      // Generate Custom Token
      const customToken = await getAuth().createCustomToken(uid);

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
