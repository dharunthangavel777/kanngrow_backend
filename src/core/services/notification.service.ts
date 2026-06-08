import { getFirestore, collections } from '../config/firebase.config';
import { FcmService, FcmPayload } from './fcm.service';
import { emailService } from '../utils/email.utils';
import { logger } from '../config/logger.config';
import { generateId } from '../utils/helpers';

export interface NotificationEvent {
  uid: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  emailTo?: string;
}

export class NotificationService {
  private db = getFirestore();
  private fcm = new FcmService();

  /**
   * Orchestrate notification delivery across In-App, FCM Push, and Brevo Email.
   */
  async send(event: NotificationEvent): Promise<void> {
    try {
      const id = generateId();
      const createdAt = new Date().toISOString();

      // 1. Fetch user to obtain email and FCM token
      const userDoc = await this.db.collection(collections.users).doc(event.uid).get();
      if (!userDoc.exists) {
        logger.warn(`NotificationService: User ${event.uid} not found`);
        return;
      }
      const userData = userDoc.data()!;
      const email = event.emailTo || userData.email;
      const fcmToken = userData.fcmToken;

      // 2. Write to Firestore user's notifications subcollection
      const notification = {
        id,
        uid: event.uid,
        type: event.type,
        title: event.title,
        body: event.body,
        isRead: false,
        createdAt,
        data: event.data || {},
      };
      await this.db
        .collection(collections.users)
        .doc(event.uid)
        .collection(collections.notifications)
        .doc(id)
        .set(notification);

      // Write a delivery log for admin audit transparency
      const logId = generateId();
      await this.db.collection(collections.notification_logs).doc(logId).set({
        id: logId,
        uid: event.uid,
        userName: userData.displayName || userData.name || email || 'User',
        type: event.type,
        title: event.title,
        body: event.body,
        sentAt: createdAt,
        channels: {
          inApp: 'success',
          push: fcmToken ? 'pending' : 'skipped',
          email: email ? 'pending' : 'skipped',
        }
      });

      // 3. Send FCM Push Notification
      if (fcmToken) {
        const fcmPayload: FcmPayload = {
          title: event.title,
          body: event.body,
          data: {
            id,
            type: event.type,
            ...(event.data || {}),
          },
        };
        this.fcm.sendToUser(event.uid, fcmPayload).then((success) => {
          this.db.collection(collections.notification_logs).doc(logId).set({
            'channels.push': success ? 'success' : 'failed'
          }, { merge: true }).catch(() => {});
        }).catch((e) => {
          logger.error(`FCM send failed for user ${event.uid}: ${e.message}`);
          this.db.collection(collections.notification_logs).doc(logId).set({
            'channels.push': 'failed'
          }, { merge: true }).catch(() => {});
        });
      }

      // 4. Send Email via Brevo API
      if (email && emailService.hasTemplate(event.type)) {
        const templateData = {
          userName: userData.displayName || userData.name || 'Entrepreneur',
          ...(event.data || {}),
        };

        emailService.sendTemplateEmail(email, event.type, templateData).then(() => {
          this.db.collection(collections.notification_logs).doc(logId).set({
            'channels.email': 'success'
          }, { merge: true }).catch(() => {});
        }).catch((e) => {
          logger.error(`Email send failed to ${email}: ${e.message}`);
          this.db.collection(collections.notification_logs).doc(logId).set({
            'channels.email': 'failed'
          }, { merge: true }).catch(() => {});
        });
      }

    } catch (error) {
      logger.error(`NotificationService.send error: ${(error as Error).message}`);
    }
  }
}

export const notificationService = new NotificationService();
