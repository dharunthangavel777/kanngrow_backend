import * as admin from 'firebase-admin';
import { env } from './env.config';
import { logger } from './logger.config';

let firebaseApp: admin.app.App;
let firebaseInitError: Error | null = null;

export function initFirebase(): void {
  if (admin.apps.length > 0) return;

  try {
    if (env.FIREBASE_PRIVATE_KEY === 'mock-private-key' || env.FIREBASE_CLIENT_EMAIL.includes('mock-email')) {
      throw new Error('Firebase credentials in .env are still set to mock placeholders.');
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY, 
      }),
    });
    logger.info('✅ Firebase Admin initialized successfully');
  } catch (error) {
    firebaseInitError = error as Error;
    logger.error(`⚠️ Firebase Admin initialization deferred: ${(error as Error).message}`);
  }
}

export function getFirestore(): admin.firestore.Firestore {
  if (!admin.apps.length) initFirebase();
  if (firebaseInitError) {
    throw new Error(`Firestore is unavailable: ${firebaseInitError.message}`);
  }
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  if (!admin.apps.length) initFirebase();
  if (firebaseInitError) {
    throw new Error(`FirebaseAuth is unavailable: ${firebaseInitError.message}`);
  }
  return admin.auth();
}

// ── Firestore Collection References ───────────────────────
export const collections = {
  users: 'users',
  profiles: 'profiles',
  chatSessions: 'chatSessions',
  messages: 'messages',
  memory: 'memory',
  workspace: 'workspace',
  ideas: 'ideas',
  notifications: 'notifications',
  onboardingState: 'onboardingState',
  adminLogs: 'admin_logs',
  adminLockouts: 'admin_lockouts',
  // ── Stage 2: Kangrow Knowledge Base ───────────────────
  knowledge_ideas: 'knowledge_ideas',
  knowledge_vendors: 'knowledge_vendors',
  knowledge_govt_schemes: 'knowledge_govt_schemes',
  knowledge_market_reports: 'knowledge_market_reports',
  // ── Token Usage Tracking ───────────────────────────────
  openai_usage_logs: 'openai_usage_logs',
  platform_config: 'platform_config',
  // ── SaaS Subscriptions & Organizations ──────────────────
  subscription_plans: 'subscription_plans',
  user_overrides: 'user_overrides',
  organizations: 'organizations',
} as const;

export type CollectionName = keyof typeof collections;
