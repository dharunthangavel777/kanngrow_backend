import { getFirestore, collections } from '../../core/config/firebase.config';
import { toTimestamp } from '../../core/utils/helpers';
import { AppError } from '../../core/middleware/error.middleware';

export class UsersService {
  private db = getFirestore();

  async getUserById(uid: string) {
    const doc = await this.db.collection(collections.users).doc(uid).get();
    if (!doc.exists) throw new AppError('User not found', 404);
    return doc.data();
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
