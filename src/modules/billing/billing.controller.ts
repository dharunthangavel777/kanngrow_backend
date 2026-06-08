import { Request, Response } from 'express';
import Stripe from 'stripe';
import { env } from '../../core/config/env.config';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { logger } from '../../core/config/logger.config';
import { successResponse, errorResponse } from '../../core/utils/responseFormatter';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { notificationService } from '../../core/services/notification.service';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10' as any, // Set to standard safe API version
});

export class BillingController {
  private db = getFirestore();

  /**
   * POST /api/v1/billing/checkout
   * Creates a checkout session for a specific subscription plan tier.
   */
  public createCheckoutSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { uid, email } = authReq;
      const { tier, successUrl, cancelUrl } = req.body;

      if (!tier || !['standard', 'premium', 'enterprise'].includes(tier)) {
        res.status(400).json(errorResponse('Invalid plan tier specified'));
        return;
      }

      // 1. Fetch Plan configuration from Firestore
      const planSnap = await this.db.collection(collections.subscription_plans).doc(tier).get();
      if (!planSnap.exists) {
        res.status(404).json(errorResponse(`Plan '${tier}' is not configured in the database.`));
        return;
      }

      const planData = planSnap.data()!;
      const stripePriceId = planData.pricing?.stripePriceIdMonthly;

      if (!stripePriceId || stripePriceId.includes('placeholder')) {
        res.status(400).json(errorResponse(`Stripe pricing is not configured for plan '${tier}'.`));
        return;
      }

      // 2. Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl || 'https://kanngrow.com/billing/success',
        cancel_url: cancelUrl || 'https://kanngrow.com/billing/cancel',
        client_reference_id: uid,
        customer_email: email,
        metadata: {
          uid,
          tier,
        },
      });

      logger.info(`SaaS: Created checkout session for user: ${uid}, plan: ${tier}`);
      res.json(successResponse({ url: session.url, sessionId: session.id }));
    } catch (error) {
      logger.error(`SaaS: createCheckoutSession error: ${(error as Error).message}`);
      res.status(500).json(errorResponse('Failed to create payment session'));
    }
  };

  /**
   * POST /api/v1/billing/webhooks
   * Listens to incoming Stripe events to sync user billing tiers in real time.
   */
  public handleWebhook = async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      res.status(400).send('Webhook Error: Missing Stripe signature header');
      return;
    }

    let event: Stripe.Event;

    try {
      // Constructs the event to guarantee it comes securely from Stripe
      const rawBody = (req as any).rawBody || req.body;
      event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      logger.error(`SaaS: Stripe Webhook signature verification failed: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      logger.info(`SaaS: Received Stripe Webhook Event: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.client_reference_id || session.metadata?.uid;
          const tier = session.metadata?.tier;
          const stripeCustomerId = session.customer as string;
          const stripeSubscriptionId = session.subscription as string;

          if (!uid || !tier) {
            logger.warn(`SaaS: Missing user reference in checkout session: ${session.id}`);
            break;
          }

          // Fetch subscription detail to get timestamps
          const subDetails = await stripe.subscriptions.retrieve(stripeSubscriptionId);

          await this.updateUserPlan(uid, {
            tier,
            status: 'active',
            stripeCustomerId,
            stripeSubscriptionId,
            currentPeriodStart: new Date(subDetails.current_period_start * 1000).toISOString(),
            currentPeriodEnd: new Date(subDetails.current_period_end * 1000).toISOString(),
            promoOverride: false,
          });

          // Send checkout complete notification
          notificationService.send({
            uid,
            type: 'billing.checkout_complete',
            title: `✅ Subscription Confirmed!`,
            body: `Welcome to the ${tier.toUpperCase()} plan! Your billing has been successfully configured.`,
            data: {
              tier,
              amount: String(session.amount_total ? session.amount_total / 100 : 0)
            }
          }).catch((e) => logger.warn(`Failed to send checkout complete notif: ${e.message}`));
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const stripeSubscriptionId = sub.id;
          const status = sub.status === 'active' ? 'active' : (sub.status === 'past_due' ? 'past_due' : 'paused');
          
          // Find user by stripeSubscriptionId
          const userQuery = await this.db
            .collection(collections.users)
            .where('subscription.stripeSubscriptionId', '==', stripeSubscriptionId)
            .limit(1)
            .get();

          if (!userQuery.empty) {
            const userDoc = userQuery.docs[0];
            await userDoc.ref.update({
              'subscription.status': status,
              'subscription.currentPeriodStart': new Date(sub.current_period_start * 1000).toISOString(),
              'subscription.currentPeriodEnd': new Date(sub.current_period_end * 1000).toISOString(),
            });
            logger.info(`SaaS: Updated subscription status to '${status}' for user: ${userDoc.id}`);

            if (status === 'past_due') {
              notificationService.send({
                uid: userDoc.id,
                type: 'billing.past_due',
                title: `⚠️ Payment Failed`,
                body: `The payment for your Kanngrow subscription failed. Please update your payment details.`,
                data: {
                  stripeSubscriptionId
                }
              }).catch((e) => logger.warn(`Failed to send past due notif: ${e.message}`));
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const stripeSubscriptionId = sub.id;

          const userQuery = await this.db
            .collection(collections.users)
            .where('subscription.stripeSubscriptionId', '==', stripeSubscriptionId)
            .limit(1)
            .get();

          if (!userQuery.empty) {
            const userDoc = userQuery.docs[0];
            const oldTier = userDoc.data().subscription?.tier || 'standard';
            await userDoc.ref.update({
              'subscription.tier': 'free',
              'subscription.status': 'canceled',
              'subscription.currentPeriodEnd': new Date(sub.ended_at ? sub.ended_at * 1000 : Date.now()).toISOString(),
            });
            logger.info(`SaaS: Cancelled/revoked subscription for user: ${userDoc.id}`);

            notificationService.send({
              uid: userDoc.id,
              type: 'billing.subscription_cancelled',
              title: `😢 Subscription Cancelled`,
              body: `Your Kanngrow subscription has been cancelled. We'd love to hear your feedback.`,
              data: {
                tier: oldTier
              }
            }).catch((e) => logger.warn(`Failed to send subscription cancelled notif: ${e.message}`));
          }
          break;
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error(`SaaS: Error processing webhook: ${(error as Error).message}`);
      res.status(500).send('Webhook processing error');
    }
  };

  private async updateUserPlan(uid: string, details: any): Promise<void> {
    try {
      await this.db.collection(collections.users).doc(uid).update({
        subscription: details,
        updatedAt: new Date().toISOString(),
      });
      logger.info(`SaaS: User '${uid}' plan tier updated to '${details.tier}'`);
    } catch (err: any) {
      logger.error(`SaaS: Failed to write user plan to Firestore: ${err.message}`);
      throw err;
    }
  }
}
