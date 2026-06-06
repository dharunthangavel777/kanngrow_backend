import * as admin from 'firebase-admin';
import { getFirestore, collections } from '../config/firebase.config';
import { logger } from '../config/logger.config';
import { initFirebase } from '../config/firebase.config';

// Initialize Firebase first
initFirebase();

const db = getFirestore();

interface PlanData {
  id: string;
  name: string;
  description: string;
  pricing: {
    monthlyUsd: number;
    annualUsd: number;
    stripePriceIdMonthly: string;
    stripePriceIdAnnual: string;
  };
  limits: {
    dailyRequests: number;
    monthlyTokens: number;
    maxUploadSizeMb: number;
    maxDocumentUploads: number;
    maxStoreCount: number;
    priorityQueue: 'basic' | 'high' | 'dedicated';
  };
  features: {
    chat: boolean;
    competitorResearch: boolean;
    seoOptimizations: boolean;
    trendAnalysis: boolean;
    marketingStrategy: boolean;
    contentGenerationSuite: boolean;
    customKnowledgeBase: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
  };
  allowedModels: string[];
  isActive: boolean;
  updatedAt: string;
  updatedBy: string;
}

const plans: PlanData[] = [
  {
    id: 'free',
    name: 'Free Plan',
    description: 'Perfect for user acquisition and product testing.',
    pricing: {
      monthlyUsd: 0,
      annualUsd: 0,
      stripePriceIdMonthly: '',
      stripePriceIdAnnual: '',
    },
    limits: {
      dailyRequests: 10,
      monthlyTokens: 50000,
      maxUploadSizeMb: 5,
      maxDocumentUploads: 3,
      maxStoreCount: 1,
      priorityQueue: 'basic',
    },
    features: {
      chat: true,
      competitorResearch: false,
      seoOptimizations: false,
      trendAnalysis: false,
      marketingStrategy: false,
      contentGenerationSuite: false,
      customKnowledgeBase: false,
      apiAccess: false,
      whiteLabel: false,
    },
    allowedModels: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    id: 'standard',
    name: 'Standard Plan',
    description: 'Designed for small e-commerce sellers starting their journey.',
    pricing: {
      monthlyUsd: 19,
      annualUsd: 190,
      stripePriceIdMonthly: 'price_standard_monthly_placeholder',
      stripePriceIdAnnual: 'price_standard_annual_placeholder',
    },
    limits: {
      dailyRequests: 100,
      monthlyTokens: 500000,
      maxUploadSizeMb: 20,
      maxDocumentUploads: 15,
      maxStoreCount: 2,
      priorityQueue: 'basic',
    },
    features: {
      chat: true,
      competitorResearch: true,
      seoOptimizations: true,
      trendAnalysis: false,
      marketingStrategy: false,
      contentGenerationSuite: false,
      customKnowledgeBase: false,
      apiAccess: false,
      whiteLabel: false,
    },
    allowedModels: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    id: 'premium',
    name: 'Premium Plan',
    description: 'Best for growing e-commerce businesses needing advanced features and deeper insights.',
    pricing: {
      monthlyUsd: 49,
      annualUsd: 490,
      stripePriceIdMonthly: 'price_premium_monthly_placeholder',
      stripePriceIdAnnual: 'price_premium_annual_placeholder',
    },
    limits: {
      dailyRequests: 500,
      monthlyTokens: 2500000,
      maxUploadSizeMb: 100,
      maxDocumentUploads: 100,
      maxStoreCount: 5,
      priorityQueue: 'high',
    },
    features: {
      chat: true,
      competitorResearch: true,
      seoOptimizations: true,
      trendAnalysis: true,
      marketingStrategy: true,
      contentGenerationSuite: true,
      customKnowledgeBase: false,
      apiAccess: false,
      whiteLabel: false,
    },
    allowedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Plan',
    description: 'Tailored for large e-commerce organizations with custom models, team features, and APIs.',
    pricing: {
      monthlyUsd: 199,
      annualUsd: 1990,
      stripePriceIdMonthly: 'price_enterprise_monthly_placeholder',
      stripePriceIdAnnual: 'price_enterprise_annual_placeholder',
    },
    limits: {
      dailyRequests: 5000,
      monthlyTokens: 25000000,
      maxUploadSizeMb: 1024,
      maxDocumentUploads: 1000,
      maxStoreCount: 50,
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
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
];export async function seedSaaS(db: admin.firestore.Firestore): Promise<void> {
  logger.info('Starting SaaS Firestore Database Seed...');

  // 1. Seed subscription plans
  for (const plan of plans) {
    await db.collection(collections.subscription_plans).doc(plan.id).set(plan);
    logger.info(`Successfully seeded plan: ${plan.id}`);
  }

  // 2. Seed default platform settings
  const openaiSettingsRef = db.collection(collections.platform_config).doc('openai_settings');
  const openaiSettingsSnap = await openaiSettingsRef.get();
  if (!openaiSettingsSnap.exists) {
    await openaiSettingsRef.set({
      maxHistoryLimit: 6,
      maxTokensMultiplier: 1.0,
      tierDownModel: false,
      updatedAt: new Date().toISOString(),
    });
    logger.info('Successfully seeded platform_config/openai_settings');
  }

  const adminSettingsRef = db.collection(collections.platform_config).doc('admin_settings');
  const adminSettingsSnap = await adminSettingsRef.get();
  if (!adminSettingsSnap.exists) {
    await adminSettingsRef.set({
      limitTokens: 1000000,
      useGPT4o: true,
      useClaude: false,
      maintenanceMode: false,
      pushNotifications: true,
      updatedAt: new Date().toISOString(),
    });
    logger.info('Successfully seeded platform_config/admin_settings');
  }

  logger.info('🎉 SaaS Firestore Database Seed completed successfully!');
}

if (typeof require !== 'undefined' && require.main === module) {
  seedSaaS(db)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ SaaS Seed failed: ${(error as Error).message}`);
      process.exit(1);
    });
}
