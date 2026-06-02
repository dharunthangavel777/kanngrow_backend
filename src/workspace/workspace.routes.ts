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

// Get all workspace items
router.get('/', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const { type } = req.query as { type?: string };

  let query = db.collection(collections.users).doc(uid).collection(collections.workspace)
    .orderBy('createdAt', 'desc') as FirebaseFirestore.Query;

  if (type) query = query.where('type', '==', type);

  const snapshot = await query.limit(50).get();
  const items = snapshot.docs.map((d) => d.data());
  res.json(successResponse({ items }));
});

// Save item to workspace
router.post('/', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const id = generateId();
  const item = {
    id,
    uid,
    ...req.body,
    createdAt: toTimestamp(),
    updatedAt: toTimestamp(),
  };
  await db.collection(collections.users).doc(uid).collection(collections.workspace).doc(id).set(item);
  res.status(201).json(successResponse({ item }));
});

// Delete workspace item
router.delete('/:itemId', async (req: Request, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  await db.collection(collections.users).doc(uid).collection(collections.workspace).doc(req.params.itemId).delete();
  res.json(successResponse({ message: 'Item deleted' }));
});
 
export { router as workspaceRoutes };
