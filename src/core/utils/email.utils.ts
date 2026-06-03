import { env } from '../config/env.config';
import { logger } from '../config/logger.config';

export class EmailService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = env.BREVO_API_KEY;
    if (this.apiKey) {
      logger.info('📧 Email service initialized with Brevo API');
    } else {
      logger.warn('⚠️ BREVO_API_KEY not found. Email service will run in MOCK mode.');
    }
  }

  public async sendOtpEmail(to: string, otp: string): Promise<void> {
    // ALWAYS log OTP to console as a safe fallback for development/debugging
    logger.info(`[FALLBACK] OTP for ${to} is: ${otp}`);
    console.log(`\n\n=== OTP FOR ${to}: ${otp} ===\n\n`);

    if (!this.apiKey) {
      return;
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'Kangrow AI Admin',
            email: env.BREVO_SENDER_EMAIL,
          },
          to: [
            {
              email: to,
            },
          ],
          subject: 'Your Admin Login OTP - Kangrow AI',
          textContent: `Your OTP for Kangrow AI Admin Portal is: ${otp}\n\nThis OTP is valid for 5 minutes.`,
          htmlContent: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Admin Login OTP</h2>
            <p>Your one-time password for the Kangrow AI Admin Portal is:</p>
            <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
            <p>This OTP is valid for <strong>5 minutes</strong>.</p>
            <hr style="border: 1px solid #ddd; margin-top: 20px;" />
            <p style="font-size: 12px; color: #888;">If you did not request this, please ignore this email.</p>
          </div>
        `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API Error (${response.status}): ${errorText}`);
      }

      logger.info(`📧 Real OTP email sent to ${to} via Brevo`);
    } catch (error) {
      logger.error(`❌ Failed to send real email to ${to} via Brevo: ${(error as Error).message}`);
      logger.warn('⚠️ OTP was still generated and logged above. Proceeding without email.');
    }
  }
}

export const emailService = new EmailService();
