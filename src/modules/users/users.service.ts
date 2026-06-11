import { getFirestore, collections } from '../../core/config/firebase.config';
import { toTimestamp } from '../../core/utils/helpers';
import { AppError } from '../../core/middleware/error.middleware';

export class UsersService {
  private db = getFirestore();

  async getUserById(uid: string) {
    const doc = await this.db.collection(collections.users).doc(uid).get();
    if (!doc.exists) throw new AppError('User not found', 404);
    
    const data = doc.data()!;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    if (data.usage) {
      const lastResetDate = data.usage.dailyRequestResetAt ? data.usage.dailyRequestResetAt.slice(0, 10) : '';
      if (lastResetDate !== todayStr) {
        data.usage.dailyRequestCount = 0;
        data.usage.dailyRequestResetAt = todayStr;
        await this.db.collection(collections.users).doc(uid).update({
          'usage.dailyRequestCount': 0,
          'usage.dailyRequestResetAt': todayStr
        }).catch(err => console.warn(`Failed to reset daily count in getUserById: ${err.message}`));
      }
    } else {
      data.usage = {
        dailyRequestCount: 0,
        dailyRequestResetAt: todayStr,
        monthlyTokenCount: 0,
        monthlyTokenResetAt: now.toISOString()
      };
      await this.db.collection(collections.users).doc(uid).update({
        usage: data.usage
      }).catch(err => console.warn(`Failed to initialize usage in getUserById: ${err.message}`));
    }

    return data;
  }

  async updateUser(uid: string, data: Partial<Record<string, unknown>>) {
    const ref = this.db.collection(collections.users).doc(uid);
    const allowed: Record<string, any> = { updatedAt: toTimestamp(), ...data };
    // Prevent overwriting protected fields
    delete allowed.uid;
    delete allowed.createdAt;
    await ref.update(allowed);
    const updated = await ref.get();
    return updated.data();
  }

  async deleteUser(uid: string) {
    const batch = this.db.batch();
    // Delete main user doc
    batch.delete(this.db.collection(collections.users).doc(uid));
    // Delete profile
    batch.delete(this.db.collection(collections.profiles).doc(uid));
    await batch.commit();
  }
}
