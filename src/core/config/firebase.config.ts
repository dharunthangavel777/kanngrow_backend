import * as admin from 'firebase-admin';
import { env } from './env.config';
import { logger } from './logger.config';

let firebaseInitError: Error | null = null;

export function initFirebase(): void {
  if (admin.apps.length > 0) return;
  try {
    if (env.FIREBASE_PRIVATE_KEY === 'mock-private-key' || env.FIREBASE_CLIENT_EMAIL.includes('mock-email')) {
      throw new Error('Firebase credentials in .env are still set to mock placeholders.');
    }
    admin.initializeApp({
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
  if (firebaseInitError) throw new Error(`Firestore is unavailable: ${firebaseInitError.message}`);
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  if (!admin.apps.length) initFirebase();
  if (firebaseInitError) throw new Error(`FirebaseAuth is unavailable: ${firebaseInitError.message}`);
  return admin.auth();
}

// ── Firestore Collections — Kangrow AI V2 ──────────────────────────────────────
export const collections = {
  // Core user data
  users:              'users',
  profiles:           'profiles',
  chatSessions:       'chatSessions',
  messages:           'messages',
  notifications:      'notifications',
  onboardingState:    'onboardingState',
  workspace:          'workspace',
  ideas:              'ideas',

  // V2: User DNA & Intelligence Engine
  user_dna:           'user_dna',
  memory_working:     'memory_working',
  memory_longterm:    'memory_longterm',
  decisions:          'decisions',
  goals:              'goals',
  behavior_events:    'behavior_events',
  news_cache:         'news_cache',

  // Platform config
  platform_context:   'platform_context',   // Admin-pinnable context (replaces old KB)
  platform_config:    'platform_config',
  openai_usage_logs:  'openai_usage_logs',

  // Admin & security
  adminLogs:          'admin_logs',
  adminLockouts:      'admin_lockouts',
  audit_logs:         'audit_logs',

  // SaaS
  subscription_plans: 'subscription_plans',
  user_overrides:     'user_overrides',
  organizations:      'organizations',
  user_subscriptions: 'user_subscriptions',
} as const;

export type CollectionName = keyof typeof collections;
