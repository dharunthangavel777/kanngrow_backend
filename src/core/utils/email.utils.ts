import nodemailer from 'nodemailer';
import { env } from '../config/env.config';
import { logger } from '../config/logger.config';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        connectionTimeout: 15000,
        socketTimeout: 15000,
      });
      logger.info(`📧 Email service initialized with SMTP (Host: ${env.SMTP_HOST}, Port: ${env.SMTP_PORT})`);
    } else {
      logger.warn('⚠️ SMTP credentials not found. Email service will run in MOCK mode.');
    }
  }

  public async sendOtpEmail(to: string, otp: string): Promise<void> {
    // ALWAYS log OTP to console as a safe fallback for development/debugging
    logger.info(`[FALLBACK] OTP for ${to} is: ${otp}`);
    console.log(`\n\n=== OTP FOR ${to}: ${otp} ===\n\n`);

    if (!this.transporter) {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Kangrow AI Admin" <${env.SMTP_USER}>`,
        to,
        subject: 'Your Admin Login OTP - Kangrow AI',
        text: `Your OTP for Kangrow AI Admin Portal is: ${otp}\n\nThis OTP is valid for 5 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Admin Login OTP</h2>
            <p>Your one-time password for the Kangrow AI Admin Portal is:</p>
            <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
            <p>This OTP is valid for <strong>5 minutes</strong>.</p>
            <hr style="border: 1px solid #ddd; margin-top: 20px;" />
            <p style="font-size: 12px; color: #888;">If you did not request this, please ignore this email.</p>
          </div>
        `,
      });
      logger.info(`📧 Real OTP email sent to ${to}`);
    } catch (error) {
      logger.error(`❌ Failed to send real email to ${to}: ${(error as Error).message}`);
      logger.warn('⚠️ OTP was still generated and logged above. Proceeding without email.');
    }
  }
}

export const emailService = new EmailService();
