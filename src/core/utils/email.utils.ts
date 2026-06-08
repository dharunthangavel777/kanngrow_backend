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

  /**
   * Check if a specific notification type has a configured email template.
   */
  public hasTemplate(type: string): boolean {
    const supported = [
      'user.onboarding_complete',
      'idea.generated',
      'idea.business_plan_ready',
      'billing.checkout_complete',
      'billing.plan_upgraded',
      'billing.subscription_cancelled',
      'billing.past_due',
      'billing.expiry_warning_7d',
      'billing.expiry_warning_1d',
    ];
    return supported.includes(type);
  }

  /**
   * Send a template-based transactional email.
   */
  public async sendTemplateEmail(to: string, type: string, data: any): Promise<void> {
    const subjectMap: Record<string, string> = {
      'user.onboarding_complete': 'Welcome to Kanngrow — Your AI Business Builder is Ready 🚀',
      'idea.generated': `💡 Your New Business Idea is Ready — ${data.ideaNames?.split(', ')[0] || 'New Idea'}`,
      'idea.business_plan_ready': `📊 Your Full Business Plan is Ready — ${data.planTitle || 'Your Idea'}`,
      'billing.checkout_complete': `✅ Payment Confirmed — Welcome to ${data.tier?.toUpperCase() || 'Standard'} Plan`,
      'billing.plan_upgraded': `🎉 Your Plan Has Been Upgraded!`,
      'billing.subscription_cancelled': `We're sad to see you go 😢 — Kanngrow subscription cancelled`,
      'billing.past_due': `⚠️ Action Required — Payment for your Kanngrow subscription failed`,
      'billing.expiry_warning_7d': `⏳ Your ${data.tier?.toUpperCase() || 'Kanngrow'} subscription renews in 7 days`,
      'billing.expiry_warning_1d': `🚨 Your subscription renews tomorrow — action needed`,
    };

    const subject = subjectMap[type] || 'Kanngrow Notification';
    const htmlContent = this.generateTemplateHtml(type, data);

    logger.info(`[EMAIL LOG] Target: ${to} | Subject: "${subject}"`);

    if (!this.apiKey) {
      logger.info(`[MOCK EMAIL] HTML generated length: ${htmlContent.length} bytes`);
      return;
    }

    await this.sendBrevo(to, subject, htmlContent);
  }

  /**
   * Send a custom broadcast email from the admin panel.
   */
  public async sendCustomEmail(to: string, name: string, subject: string, body: string): Promise<void> {
    const htmlContent = this.wrapHtml(
      subject,
      `
      <h2>Hello ${name},</h2>
      <div style="color: #cbd5e1; font-size: 15px; margin-bottom: 24px; white-space: pre-wrap;">
        ${body}
      </div>
      `
    );

    if (!this.apiKey) {
      logger.info(`[MOCK EMAIL] Broadcast to ${to} | Subject: "${subject}"`);
      return;
    }

    await this.sendBrevo(to, subject, htmlContent);
  }

  /**
   * Send OTP Email for admin login.
   */
  public async sendOtpEmail(to: string, otp: string): Promise<void> {
    logger.info(`[FALLBACK] OTP for ${to} is: ${otp}`);
    console.log(`\n\n=== OTP FOR ${to}: ${otp} ===\n\n`);

    if (!this.apiKey) {
      return;
    }

    const htmlContent = this.wrapHtml(
      'Admin Login OTP',
      `
      <h2>Admin Login OTP</h2>
      <p>Your one-time password for the Kanngrow AI Admin Portal is:</p>
      <h1 style="color: #00e5ff; font-size: 32px; letter-spacing: 5px; background-color: #1e293b; padding: 12px; border-radius: 8px; text-align: center;">${otp}</h1>
      <p>This OTP is valid for <strong>5 minutes</strong>.</p>
      <hr style="border: 1px solid #1e293b; margin-top: 20px;" />
      <p style="font-size: 12px; color: #64748b;">If you did not request this, please ignore this email.</p>
      `
    );

    await this.sendBrevo(to, 'Your Admin Login OTP - Kanngrow AI', htmlContent);
  }

  private async sendBrevo(to: string, subject: string, htmlContent: string): Promise<void> {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey!,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'Kanngrow AI',
            email: env.BREVO_SENDER_EMAIL,
          },
          to: [{ email: to }],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API Error (${response.status}): ${errorText}`);
      }

      logger.info(`📧 Email sent to ${to} via Brevo`);
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to} via Brevo: ${(error as Error).message}`);
      throw error;
    }
  }

  private generateTemplateHtml(type: string, data: any): string {
    const userName = data.userName || 'Entrepreneur';

    switch (type) {
      case 'user.onboarding_complete':
        return this.wrapHtml(
          'Welcome to Kanngrow',
          `
          <h2>You're all set, ${userName}! 🚀</h2>
          <p>Welcome to Kanngrow. Your personalized AI Business Builder dashboard is ready.</p>
          <p>Here's what you can do right now:</p>
          <div style="background-color: #1e293b; border-left: 4px solid #00e5ff; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <strong>💡 Generate E-commerce Ideas:</strong> Find product ideas matching your specific budget, region, and risk tolerance.<br><br>
            <strong>🎯 Validate Fast:</strong> Use zero-budget validation strategies to check demand before investing.<br><br>
            <strong>📊 Launch Roadmaps:</strong> Generate step-by-step 90-day execution plans.
          </div>
          <a href="https://kanngrow.com/dashboard" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Start Your First Idea &rarr;</a>
          `
        );

      case 'idea.generated':
        const ideaNames = data.ideaNames || 'your custom ideas';
        return this.wrapHtml(
          'Business Ideas Generated',
          `
          <h2>💡 New Business Ideas Ready!</h2>
          <p>Hello ${userName},</p>
          <p>We've generated customized business ideas tailored to your founder DNA. Here's a quick preview:</p>
          <div style="background-color: #1e293b; border-left: 4px solid #00e5ff; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <strong>Generated Ideas:</strong><br>
            ${ideaNames.split(', ').map((n: string) => `&bull; ${n}`).join('<br>')}
          </div>
          <p>Log in to view detailed categories, target audiences, margins, competition profiles, and validation steps for each idea.</p>
          <a href="https://kanngrow.com/workspace" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">View My Ideas &rarr;</a>
          `
        );

      case 'idea.business_plan_ready':
        const planTitle = data.planTitle || 'Your Business Plan';
        return this.wrapHtml(
          'Business Plan Ready',
          `
          <h2>📊 Your Business Plan is Ready!</h2>
          <p>Hello ${userName},</p>
          <p>Congratulations! The full, comprehensive business plan for <strong>${planTitle}</strong> is ready for your review.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #00e5ff; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <strong>Key sections included:</strong><br>
            &bull; Executive Summary<br>
            &bull; Market Size & Growth in India<br>
            &bull; Sourcing and MOQ Details<br>
            &bull; Zero-CAC Launch & Marketing Strategy
          </div>
          <p>Take action today to move your business from idea to execution.</p>
          <a href="https://kanngrow.com/workspace" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Open Business Plan &rarr;</a>
          `
        );

      case 'billing.checkout_complete':
        const buyTier = data.tier || 'Standard';
        const buyAmount = data.amount || '0';
        return this.wrapHtml(
          'Payment Confirmed',
          `
          <h2>✅ Payment Confirmed!</h2>
          <p>Hello ${userName},</p>
          <p>Thank you for subscribing to Kanngrow. Your payment of <strong>₹${buyAmount}</strong> was processed successfully.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #00e5ff; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <strong>Plan:</strong> ${buyTier.toUpperCase()}<br>
            <strong>Status:</strong> Active<br>
            <strong>Features Unlocked:</strong> Full AI access, advanced validation, and marketing strategy builders.
          </div>
          <a href="https://kanngrow.com/dashboard" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Explore Your Features &rarr;</a>
          `
        );

      case 'billing.plan_upgraded':
        const upgradeTier = data.tier || 'Standard';
        const isLifetime = data.isLifetime === 'true' ? ' (Lifetime)' : '';
        return this.wrapHtml(
          'Plan Upgraded',
          `
          <h2>🎉 Your Plan Has Been Upgraded!</h2>
          <p>Hello ${userName},</p>
          <p>An administrator has manually upgraded your subscription to the <strong>${upgradeTier.toUpperCase()} Plan${isLifetime}</strong>.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #00e5ff; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <strong>Upgrade details:</strong><br>
            &bull; Plan: ${upgradeTier.toUpperCase()}${isLifetime}<br>
            &bull; Note: ${data.notes || 'Special admin assignment'}
          </div>
          <p>All premium tools and features are now fully available on your account.</p>
          <a href="https://kanngrow.com/dashboard" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Launch Workspace &rarr;</a>
          `
        );

      case 'billing.subscription_cancelled':
        return this.wrapHtml(
          'Subscription Cancelled',
          `
          <h2>We're sad to see you go 😢</h2>
          <p>Hello ${userName},</p>
          <p>Your Kanngrow subscription has been cancelled and will expire at the end of the current period.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <strong>What happens next:</strong><br>
            You will lose access to premium features (including competitor research and unlimited AI-generated ideas) when the billing cycle ends. Your saved ideas and plans will remain in read-only mode.
          </div>
          <p>If you'd like to reactivate, you can manage your subscription inside the billing center anytime.</p>
          <a href="https://kanngrow.com/billing" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Manage Subscription &rarr;</a>
          `
        );

      case 'billing.past_due':
        return this.wrapHtml(
          'Payment Failed',
          `
          <h2>⚠️ Action Required: Payment Failed</h2>
          <p>Hello ${userName},</p>
          <p>The payment for your Kanngrow subscription failed to process. We will retry in a few days.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
            Please update your payment method to ensure uninterrupted access to your business builder tools and AI pipelines.
          </div>
          <a href="https://kanngrow.com/billing" style="display: inline-block; background-color: #ef4444; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Update Payment Method &rarr;</a>
          `
        );

      case 'billing.expiry_warning_7d':
        return this.wrapHtml(
          'Subscription Renewal Notice',
          `
          <h2>⏳ Your subscription renews in 7 days</h2>
          <p>Hello ${userName},</p>
          <p>This is a quick reminder that your ${data.tier?.toUpperCase()} plan subscription is scheduled to renew in 7 days on ${new Date(data.expiryDate).toLocaleDateString()}.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #f97316; padding: 16px; border-radius: 4px; margin: 20px 0;">
            No action is needed if you wish to renew. You can manage or cancel your subscription anytime via your account settings.
          </div>
          <a href="https://kanngrow.com/billing" style="display: inline-block; background-color: #00e5ff; color: #0d0f14 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Manage Plan &rarr;</a>
          `
        );

      case 'billing.expiry_warning_1d':
        return this.wrapHtml(
          'Subscription Renewal Reminder',
          `
          <h2>🚨 Your subscription renews tomorrow</h2>
          <p>Hello ${userName},</p>
          <p>Your ${data.tier?.toUpperCase()} plan subscription is scheduled to renew tomorrow.</p>
          <div style="background-color: #1e293b; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
            Please check that your saved card details are correct to prevent any billing disruption.
          </div>
          <a href="https://kanngrow.com/billing" style="display: inline-block; background-color: #ef4444; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; text-align: center; font-size: 16px;">Manage Plan &rarr;</a>
          `
        );

      default:
        return this.wrapHtml('Notification', `<h2>Notification Notification</h2><p>Hello ${userName}, you have a new notification from Kanngrow.</p>`);
    }
  }

  private wrapHtml(title: string, bodyContent: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body {
            background-color: #0d0f14;
            color: #ffffff;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #151821;
            border: 1px solid #1e293b;
            border-radius: 12px;
            overflow: hidden;
          }
          .header {
            padding: 32px 24px;
            text-align: center;
            background-color: #1e293b;
            border-bottom: 1px solid #1e293b;
          }
          .header h1 {
            color: #00e5ff;
            font-size: 28px;
            font-weight: 700;
            margin: 0;
            letter-spacing: 1px;
          }
          .header p {
            color: #94a3b8;
            font-size: 12px;
            margin: 6px 0 0 0;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .content {
            padding: 40px 32px;
            line-height: 1.6;
            color: #cbd5e1;
            font-size: 16px;
          }
          .content h2 {
            color: #ffffff;
            font-size: 22px;
            margin-top: 0;
            margin-bottom: 20px;
          }
          .content p {
            margin: 0 0 16px 0;
          }
          .footer {
            padding: 32px 24px;
            text-align: center;
            font-size: 12px;
            color: #64748b;
            border-top: 1px solid #1e293b;
            background-color: #0d0f14;
          }
          .footer p {
            margin: 0 0 8px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>KANNGROW AI</h1>
            <p>Your E-commerce Growth Partner</p>
          </div>
          <div class="content">
            ${bodyContent}
          </div>
          <div class="footer">
            <p>You received this email because you are registered on Kanngrow.</p>
            <p>&copy; 2026 Kanngrow. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
