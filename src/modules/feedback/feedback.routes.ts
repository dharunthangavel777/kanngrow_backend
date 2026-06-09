import { Router, Request, Response } from 'express';
import { getFirestore } from '../../core/config/firebase.config';
import { authMiddleware } from '../../core/middleware/auth.middleware';
import { logger } from '../../core/config/logger.config';

const router = Router();

router.use(authMiddleware);

// POST /api/v1/feedback — Save user feedback to Firestore 'feedback' collection
router.post('/', async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user?.uid;
    const email = (req as any).user?.email || 'anonymous';
    const { message, rating, category } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Message must be at least 5 characters.' });
    }

    const db = getFirestore();
    const docRef = db.collection('feedback').doc();
    await docRef.set({
      uid,
      email,
      message: message.trim(),
      rating: typeof rating === 'number' ? Math.min(5, Math.max(1, rating)) : 5,
      category: ['Bug', 'Feature Request', 'General'].includes(category) ? category : 'General',
      createdAt: new Date().toISOString(),
    });

    logger.info(`Feedback received from uid=${uid}`);
    return res.json({ success: true, message: 'Feedback submitted. Thank you!' });
  } catch (err) {
    logger.error(`Feedback error: ${(err as Error).message}`);
    return res.status(500).json({ success: false, error: 'Failed to save feedback.' });
  }
});

export { router as feedbackRoutes };
