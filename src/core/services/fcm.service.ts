import * as admin from 'firebase-admin';
import { getFirestore, collections } from '../config/firebase.config';
import { logger } from '../config/logger.config';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export class FcmService {
  /**
   * Send a push notification to a single user via their stored FCM token.
   */
  async sendToUser(uid: string, payload: FcmPayload): Promise<boolean> {
    try {
      const db = getFirestore();
      const userDoc = await db.collection(collections.users).doc(uid).get();
      const fcmToken = userDoc.data()?.fcmToken as string | undefined;

      if (!fcmToken) {
        logger.debug(`No FCM token for user ${uid} — skipping push`);
        return false;
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'kangrow_notifications',
            priority: 'high',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);
      logger.info(`✅ FCM push sent to user ${uid}: "${payload.title}"`);
      return true;
    } catch (error) {
      const err = error as Error;
      // If token is invalid/expired, clear it from user document
      if (err.message?.includes('registration-token-not-registered') ||
          err.message?.includes('invalid-registration-token')) {
        logger.warn(`Clearing invalid FCM token for user ${uid}`);
        try {
          await getFirestore().collection(collections.users).doc(uid).update({ fcmToken: null });
        } catch { /* ignore */ }
      }
      logger.warn(`FCM push failed for user ${uid}: ${err.message}`);
      return false;
    }
  }

  /**
   * Send a push notification to a topic (e.g. 'all_users', 'premium_users').
   */
  async sendToTopic(topic: string, payload: FcmPayload): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'kangrow_notifications',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      };

      await admin.messaging().send(message);
      logger.info(`✅ FCM topic push sent to "${topic}": "${payload.title}"`);
      return true;
    } catch (error) {
      logger.warn(`FCM topic push failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Send push notifications to multiple users by UID list.
   */
  async sendToUsers(uids: string[], payload: FcmPayload): Promise<number> {
    let successCount = 0;
    // Firebase supports multicast up to 500 tokens at once
    const db = getFirestore();
    const chunks: string[][] = [];
    for (let i = 0; i < uids.length; i += 500) {
      chunks.push(uids.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      // Fetch FCM tokens for this chunk
      const tokenDocs = await Promise.all(
        chunk.map((uid) => db.collection(collections.users).doc(uid).get())
      );
      const tokens = tokenDocs
        .map((doc) => doc.data()?.fcmToken as string | undefined)
        .filter((token): token is string => !!token);

      if (tokens.length === 0) continue;

      try {
        const multicastMessage: admin.messaging.MulticastMessage = {
          tokens,
          notification: { title: payload.title, body: payload.body },
          data: payload.data || {},
          android: {
            priority: 'high',
            notification: { channelId: 'kangrow_notifications', sound: 'default' },
          },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        };
        const response = await admin.messaging().sendEachForMulticast(multicastMessage);
        successCount += response.successCount;
      } catch (error) {
        logger.warn(`Multicast FCM failed for chunk: ${(error as Error).message}`);
      }
    }

    return successCount;
  }

  /**
   * Subscribe a user's FCM token to a topic.
   */
  async subscribeToTopic(token: string, topic: string): Promise<void> {
    try {
      await admin.messaging().subscribeToTopic([token], topic);
      logger.debug(`Subscribed token to topic "${topic}"`);
    } catch (error) {
      logger.warn(`Failed to subscribe token to topic: ${(error as Error).message}`);
    }
  }
}
