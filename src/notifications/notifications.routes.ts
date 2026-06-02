import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../core/middleware/auth.middleware';
import { getFirestore, collections } from '../core/config/firebase.config';
import { successResponse } from '../core/utils/responseFormatter';
import { authMiddleware } from '../core/middleware/auth.middleware';
import { generateId, toTimestamp } from '../core/utils/helpers';

const router = Router();
const db = getFirestore();

router.use(authMiddleware);

// Get notifications (most recent 20)
router.get('/', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const snapshot = await db
    .collection(collections.users)
    .doc(uid)
    .collection(collections.notifications)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const notifications = snapshot.docs.map((d) => d.data());
  res.json(successResponse({ notifications }));
});

// Mark all as read
router.patch('/read-all', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const snapshot = await db
    .collection(collections.users)
    .doc(uid)
    .collection(collections.notifications)
    .where('isRead', '==', false)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();

  res.json(successResponse({ updated: snapshot.size }));
});

// Create a notification (internal use / seed data)
router.post('/', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const id = generateId();
  const notification = {
    id,
    uid,
    ...req.body,
    isRead: false,
    createdAt: toTimestamp(),
  };
  await db.collection(collections.users).doc(uid).collection(collections.notifications).doc(id).set(notification);
  res.status(201).json(successResponse({ notification }));
});

// Broadcast a notification to all users (Admin operation)
router.post('/broadcast', async (req: Request, res: Response) => {
  const { title, body } = req.body;
  // In a real app, this would iterate over all users or use an FCM topic.
  // We mock the response to signify the broadcast command was received.
  res.status(200).json(successResponse({ message: 'Broadcast sent successfully to all users', data: { title, body } }));
});

export { router as notificationsRoutes };
