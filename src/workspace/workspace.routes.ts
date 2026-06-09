import { Router } from 'express';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../core/middleware/auth.middleware';
import { getFirestore, collections } from '../core/config/firebase.config';
import { successResponse } from '../core/utils/responseFormatter';
import { authMiddleware } from '../core/middleware/auth.middleware';
import { subscriptionMiddleware, SubscriptionRequest } from '../core/middleware/subscription.middleware';
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
router.post('/', subscriptionMiddleware, async (req: Request, res: Response) => {
  const subReq = req as SubscriptionRequest;
  const { uid, subscription } = subReq;
  const { type, sizeMb } = req.body;

  if (type === 'store') {
    if (subscription) {
      const storeLimit = subscription.limits.maxStoreCount;
      const existingStoresSnap = await db.collection(collections.users).doc(uid).collection(collections.workspace)
        .where('type', '==', 'store')
        .get();

      if (existingStoresSnap.size >= storeLimit) {
        res.status(403).json({
          success: false,
          error: `Store limit reached. Your plan allows up to ${storeLimit} store(s). Please upgrade to add more stores.`,
          code: 'LIMIT_EXCEEDED_STORES'
        });
        return;
      }
    }
  }

  if (type === 'document') {
    if (subscription) {
      if (!subscription.features.customKnowledgeBase) {
        res.status(403).json({
          success: false,
          error: 'Custom Knowledge Base features are disabled on your current plan. Please upgrade to Enterprise to upload documents.',
          code: 'FEATURE_LOCKED_KB'
        });
        return;
      }

      const docLimit = subscription.limits.maxDocumentUploads;
      const existingDocsSnap = await db.collection(collections.users).doc(uid).collection(collections.workspace)
        .where('type', '==', 'document')
        .get();

      if (existingDocsSnap.size >= docLimit) {
        res.status(403).json({
          success: false,
          error: `Document limit reached. Your plan allows up to ${docLimit} document(s).`,
          code: 'LIMIT_EXCEEDED_DOCUMENTS'
        });
        return;
      }

      const uploadSizeLimit = subscription.limits.maxUploadSizeMb;
      const requestedSize = Number(sizeMb) || 0;
      if (requestedSize > uploadSizeLimit) {
        res.status(403).json({
          success: false,
          error: `File size exceeds the limit of ${uploadSizeLimit} MB allowed on your plan.`,
          code: 'LIMIT_EXCEEDED_FILE_SIZE'
        });
        return;
      }
    }
  }

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
