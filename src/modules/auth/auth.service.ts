import { getFirestore, collections } from '../../core/config/firebase.config';
import { generateId, toTimestamp } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

export interface KangrowUser {
  uid: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  onboardingComplete: boolean;
}

export class AuthService {
  private db = getFirestore();

  async findOrCreateUser(uid: string, email?: string): Promise<KangrowUser> {
    const userRef = this.db.collection(collections.users).doc(uid);
    const snapshot = await userRef.get();

    if (snapshot.exists) {
      logger.debug(`Existing user login: ${uid}`);
      await userRef.update({ updatedAt: toTimestamp() });
      return snapshot.data() as KangrowUser;
    }

    // New user — create Firestore document
    const newUser: KangrowUser = {
      uid,
      email,
      createdAt: toTimestamp(),
      updatedAt: toTimestamp(),
      onboardingComplete: false,
    };

    await userRef.set(newUser);
    logger.info(`New user created: ${uid}`);
    return newUser;
  }
}
