import { Router, Request, Response } from 'express';
import { ProfileController } from './profile.controller';
import { authMiddleware, AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { FcmService } from '../../core/services/fcm.service';
import { successResponse } from '../../core/utils/responseFormatter';

const router = Router();
const controller = new ProfileController();
const fcmService = new FcmService();

router.use(authMiddleware);

router.get('/', (req, res) => controller.getProfile(req, res));
router.post('/', (req, res) => controller.upsertProfile(req, res));
router.patch('/', (req, res) => controller.upsertProfile(req, res));

// POST /profile/fcm-token — Store device token for push notifications
router.post('/fcm-token', async (req: Request, res: Response): Promise<void> => {
  const { uid } = req as AuthenticatedRequest;
  const { token } = req.body as { token: string };

  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, error: 'FCM token is required' });
    return;
  }

  try {
    const db = getFirestore();

    // Store the FCM token on the user document
    await db.collection(collections.users).doc(uid).update({ fcmToken: token });

    // Subscribe to the 'all_users' topic by default
    await fcmService.subscribeToTopic(token, 'all_users');

    // Also subscribe to plan-specific topic based on current tier
    const userDoc = await db.collection(collections.users).doc(uid).get();
    const tier = (userDoc.data()?.subscription?.tier as string) || 'free';
    if (tier !== 'free') {
      await fcmService.subscribeToTopic(token, `${tier}_users`);
    }

    res.json(successResponse({ message: 'FCM token registered successfully' }));
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to register FCM token' });
  }
});

export { router as profileRoutes };
