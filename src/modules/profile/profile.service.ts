import { getFirestore, collections } from '../../core/config/firebase.config';
import { toTimestamp } from '../../core/utils/helpers';

export interface BusinessProfile {
  uid: string;
  storeName?: string;
  industry?: string;
  targetAudience?: string;
  budget?: string;
  businessModel?: string;
  stage?: string;
  goal?: string;
  userType?: string;
  experienceLevel?: string;
  productCategory?: string;
  state?: string;
  updatedAt: string;
}

export class ProfileService {
  private db = getFirestore();

  async getProfile(uid: string): Promise<BusinessProfile | null> {
    const doc = await this.db.collection(collections.profiles).doc(uid).get();
    if (!doc.exists) return null;
    return doc.data() as BusinessProfile;
  }

  async upsertProfile(
    uid: string,
    data: Partial<BusinessProfile>,
  ): Promise<BusinessProfile> {
    const ref = this.db.collection(collections.profiles).doc(uid);
    const existing = await ref.get();

    const profile: Partial<BusinessProfile> = {
      ...(existing.exists ? (existing.data() as BusinessProfile) : {}),
      ...data,
      uid,
      updatedAt: toTimestamp(),
    };

    await ref.set(profile, { merge: true });
    return profile as BusinessProfile;
  }
}
