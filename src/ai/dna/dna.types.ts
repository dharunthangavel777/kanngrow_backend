// ── User DNA Types ─────────────────────────────────────────────────────────────
// The DNA is the complete profile of who the user is, how they think, and how
// they prefer to communicate. It is silently inferred from conversations —
// the user never fills out a form for this.

export interface UserDNA {
  uid: string;

  // ── Identity (auto-detected from messages) ───────────────────────────────────
  name?: string;
  language: LanguageCode;
  country: string;
  state?: string;
  city?: string;
  timezone: string;
  currency: string;

  // ── Business Profile ─────────────────────────────────────────────────────────
  businessStage: BusinessStage;
  budget?: number;                // in ₹
  budgetLabel?: string;           // '₹50K–₹1L'
  preferredModel?: string;        // 'reseller' | 'export' | 'd2c' | 'dropship' | 'saas'
  riskTolerance: RiskTolerance;
  goals: string[];
  currentGoal?: string;
  niche?: string;                 // 'Textiles', 'Organic Food', etc.
  targetMarket?: string;

  // ── Behavior & Learning ──────────────────────────────────────────────────────
  preferredResponseStyle: ResponseStyle;
  preferredTopics: string[];
  avoidedTopics: string[];
  decisionSpeed: DecisionSpeed;
  emotionalState: EmotionalState;

  // ── Usage Telemetry ──────────────────────────────────────────────────────────
  totalMessages: number;
  totalSessions: number;
  firstMessageAt?: string;
  lastActiveAt?: string;

  // ── Meta ──────────────────────────────────────────────────────────────────────
  dnaVersion: number;
  updatedAt: string;
  createdAt: string;
}

export type LanguageCode =
  | 'english' | 'tamil' | 'tanglish' | 'hindi' | 'hinglish'
  | 'malayalam' | 'telugu' | 'kannada' | 'bengali' | 'mixed';

export type BusinessStage =
  | 'idea' | 'validating' | 'starting' | 'growing' | 'scaling';

export type RiskTolerance = 'low' | 'medium' | 'high';

export type ResponseStyle = 'casual' | 'detailed' | 'story' | 'analytical';

export type DecisionSpeed = 'fast' | 'researcher' | 'hesitant';

export type EmotionalState =
  | 'excited' | 'confused' | 'ready' | 'overwhelmed' | 'researching' | 'discouraged';

export const DEFAULT_DNA: Omit<UserDNA, 'uid' | 'createdAt' | 'updatedAt'> = {
  language: 'english',
  country: 'India',
  timezone: 'Asia/Kolkata',
  currency: '₹',
  businessStage: 'idea',
  riskTolerance: 'medium',
  goals: [],
  preferredResponseStyle: 'casual',
  preferredTopics: [],
  avoidedTopics: [],
  decisionSpeed: 'researcher',
  emotionalState: 'researching',
  totalMessages: 0,
  totalSessions: 0,
  dnaVersion: 1,
};
