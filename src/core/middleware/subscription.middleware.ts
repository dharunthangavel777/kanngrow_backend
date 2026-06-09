import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { getFirestore, collections } from '../config/firebase.config';
import { logger } from '../config/logger.config';

export interface SubscriptionLimits {
  dailyRequests: number;
  monthlyTokens: number;
  maxUploadSizeMb: number;
  maxDocumentUploads: number;
  maxStoreCount: number;
  priorityQueue: 'basic' | 'high' | 'dedicated';
}

export interface SubscriptionFeatures {
  chat: boolean;
  competitorResearch: boolean;
  seoOptimizations: boolean;
  trendAnalysis: boolean;
  marketingStrategy: boolean;
  contentGenerationSuite: boolean;
  customKnowledgeBase: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
}

export interface UserSubscriptionDetails {
  tier: 'free' | 'standard' | 'premium' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'paused';
  limits: SubscriptionLimits;
  features: SubscriptionFeatures;
  allowedModels: string[];
}

// Extend AuthenticatedRequest to include subscription info
export interface SubscriptionRequest extends AuthenticatedRequest {
  subscription?: UserSubscriptionDetails;
}

export async function subscriptionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const db = getFirestore();
    const authReq = req as SubscriptionRequest;
    const uid = authReq.uid;

    if (!uid) {
      res.status(401).json({ success: false, error: 'Unauthorized: Missing UID' });
      return;
    }

    // Bypass subscription checks and daily limits for admin users
    if (authReq.role === 'admin' || authReq.role === 'super_admin') {
      authReq.subscription = {
        tier: 'enterprise',
        status: 'active',
        limits: {
          dailyRequests: 999999,
          monthlyTokens: 999999999,
          maxUploadSizeMb: 10240,
          maxDocumentUploads: 10000,
          maxStoreCount: 1000,
          priorityQueue: 'dedicated',
        },
        features: {
          chat: true,
          competitorResearch: true,
          seoOptimizations: true,
          trendAnalysis: true,
          marketingStrategy: true,
          contentGenerationSuite: true,
          customKnowledgeBase: true,
          apiAccess: true,
          whiteLabel: true,
        },
        allowedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'],
      };
      next();
      return;
    }

    // 1. Fetch User document
    const userRef = db.collection(collections.users).doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const userData = userSnap.data()!;
    
    // 2. Resolve Subscription Tier
    let subscription = userData.subscription || {
      tier: 'free',
      status: 'active',
      promoOverride: false
    };

    let tier = subscription.tier || 'free';
    let status = subscription.status || 'active';
    const isLifetime = subscription.isLifetime === true || subscription.currentPeriodEnd === 'lifetime';

    // Check expiration if not free and not lifetime
    if (tier !== 'free' && !isLifetime && subscription.currentPeriodEnd) {
      const expiry = new Date(subscription.currentPeriodEnd);
      if (isNaN(expiry.getTime()) || expiry < new Date()) {
        // Expired! Downgrade user to free tier in Firestore
        logger.info(`SaaS: User ${uid} subscription tier '${tier}' has expired on ${subscription.currentPeriodEnd}. Downgrading to free.`);
        tier = 'free';
        status = 'active';
        subscription = {
          tier: 'free',
          status: 'active',
          stripeCustomerId: subscription.stripeCustomerId || 'manual',
          stripeSubscriptionId: subscription.stripeSubscriptionId || 'manual',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: null as any,
          isLifetime: false,
          sourceType: 'free',
          promoOverride: false
        };
        await userRef.update({
          subscription,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 3. Fetch Plan details from subscription_plans
    const planSnap = await db.collection(collections.subscription_plans).doc(tier).get();
    if (!planSnap.exists) {
      logger.error(`SaaS: Plan configuration for tier '${tier}' not found in database.`);
      res.status(500).json({ success: false, error: 'Internal server configuration error' });
      return;
    }

    const planData = planSnap.data()!;
    const planLimits: SubscriptionLimits = planData.limits;
    const planFeatures: SubscriptionFeatures = planData.features;
    const allowedModels: string[] = planData.allowedModels || [];

    // 4. Resolve User-specific limit overrides (if any)
    const overrideSnap = await db.collection(collections.user_overrides).doc(uid).get();
    let finalLimits = { ...planLimits };
    let finalFeatures = { ...planFeatures };
    let finalModels = [...allowedModels];

    if (overrideSnap.exists) {
      const overrideData = overrideSnap.data()!;
      if (overrideData.limitOverrides) {
        finalLimits = { ...finalLimits, ...overrideData.limitOverrides };
      }
      if (overrideData.featuresEnabled) {
        finalFeatures = { ...finalFeatures, ...overrideData.featuresEnabled };
      }
      if (overrideData.allowedModels) {
        finalModels = overrideData.allowedModels;
      }
    }

    // 5. Enforce Limits (Daily Requests Reset & Increment)
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    
    const usage = userData.usage || {
      dailyRequestCount: 0,
      dailyRequestResetAt: todayStr,
      monthlyTokenCount: 0,
      monthlyTokenResetAt: now.toISOString()
    };

    let dailyCount = usage.dailyRequestCount || 0;
    const lastResetDate = usage.dailyRequestResetAt ? usage.dailyRequestResetAt.slice(0, 10) : '';

    if (lastResetDate !== todayStr) {
      // It's a new day, reset the count
      dailyCount = 0;
      await userRef.update({
        'usage.dailyRequestCount': 0,
        'usage.dailyRequestResetAt': todayStr
      });
    }

    // Check if limit is reached
    if (dailyCount >= finalLimits.dailyRequests) {
      res.status(429).json({
        success: false,
        error: `Daily limit of ${finalLimits.dailyRequests} requests exceeded for plan '${tier}'. Please upgrade or try again tomorrow.`,
        code: 'LIMIT_EXCEEDED_DAILY',
        limits: finalLimits
      });
      return;
    }

    // Increment request count in Firestore (non-blocking / asynchronous update)
    userRef.update({
      'usage.dailyRequestCount': dailyCount + 1
    }).catch(err => logger.warn(`SaaS: Failed to update user dailyRequestCount: ${err.message}`));

    // 6. Attach subscription information to the request object
    authReq.subscription = {
      tier,
      status,
      limits: finalLimits,
      features: finalFeatures,
      allowedModels: finalModels
    };

    next();
  } catch (error) {
    logger.error(`SaaS: subscriptionMiddleware error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Internal server authorization error' });
  }
}
