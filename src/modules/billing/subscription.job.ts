import cron from 'node-cron';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { notificationService } from '../../core/services/notification.service';
import { logger } from '../../core/config/logger.config';

export async function runSubscriptionExpiryCheck(): Promise<void> {
  const jobStart = Date.now();
  logger.info('[Subscription Job] ⏳ Starting daily subscription expiry warning scan...');

  try {
    const db = getFirestore();
    const now = new Date();
    const dayInMs = 24 * 60 * 60 * 1000;

    // 1. Fetch active non-free subscription users
    const usersSnap = await db
      .collection(collections.users)
      .where('subscription.status', '==', 'active')
      .get();

    logger.info(`[Subscription Job] Scanning ${usersSnap.size} active user subscriptions...`);

    let sent7d = 0;
    let sent1d = 0;

    for (const doc of usersSnap.docs) {
      try {
        const userData = doc.data();
        const sub = userData.subscription;

        if (!sub || sub.tier === 'free' || sub.isLifetime || !sub.currentPeriodEnd) {
          continue;
        }

        const end = new Date(sub.currentPeriodEnd);
        const diffMs = end.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / dayInMs);

        const warningsSent: string[] = sub.warningsSent || [];

        if (diffDays === 7 && !warningsSent.includes('7d')) {
          await notificationService.send({
            uid: doc.id,
            type: 'billing.expiry_warning_7d',
            title: `⏳ Subscription Renewal in 7 Days`,
            body: `Your ${sub.tier.toUpperCase()} plan subscription renews in 7 days on ${end.toLocaleDateString()}.`,
            data: {
              tier: sub.tier,
              expiryDate: sub.currentPeriodEnd,
            },
          });

          await doc.ref.update({
            'subscription.warningsSent': [...warningsSent, '7d'],
          });
          sent7d++;
        } else if (diffDays === 1 && !warningsSent.includes('1d')) {
          await notificationService.send({
            uid: doc.id,
            type: 'billing.expiry_warning_1d',
            title: `🚨 Subscription Renews Tomorrow`,
            body: `Your ${sub.tier.toUpperCase()} plan subscription renews tomorrow. Please check your payment details.`,
            data: {
              tier: sub.tier,
              expiryDate: sub.currentPeriodEnd,
            },
          });

          await doc.ref.update({
            'subscription.warningsSent': [...warningsSent, '1d'],
          });
          sent1d++;
        }
      } catch (err) {
        logger.warn(`[Subscription Job] Error processing user ${doc.id}: ${(err as Error).message}`);
      }
    }

    const elapsed = ((Date.now() - jobStart) / 1000).toFixed(1);
    logger.info(`[Subscription Job] ✅ Completed in ${elapsed}s. Sent: 7d=${sent7d}, 1d=${sent1d}`);
  } catch (error) {
    logger.error(`[Subscription Job] Fatal scan error: ${(error as Error).message}`);
  }
}

let _subCronTask: cron.ScheduledTask | null = null;

export function startSubscriptionJob(): void {
  if (_subCronTask) {
    logger.warn('[Subscription Job] Already scheduled.');
    return;
  }

  // Runs daily at 08:00 AM server time (or container local time)
  _subCronTask = cron.schedule('0 8 * * *', () => {
    runSubscriptionExpiryCheck().catch((err) =>
      logger.error(`[Subscription Job] Cron trigger failed: ${err.message}`)
    );
  });

  logger.info('[Subscription Job] 🗓️ Scheduled — runs daily at 08:00 AM');
}

export function stopSubscriptionJob(): void {
  if (_subCronTask) {
    _subCronTask.stop();
    _subCronTask = null;
    logger.info('[Subscription Job] Stopped.');
  }
}
