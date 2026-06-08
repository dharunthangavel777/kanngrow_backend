// ── AI Router V2 — Fast Keyword Intent Classifier ────────────────────────────
// ZERO API calls. 0ms latency. Deterministic. Free.

import { BusinessIntent, classifyIntent } from '../intelligence/business.context';

export interface RouterResult {
  intent: BusinessIntent;
  niche: string | null;
  confidence: number;
}

export class AIRouterService {
  detectIntent(userMessage: string): RouterResult {
    const { intent, niche } = classifyIntent(userMessage);
    return { intent, niche, confidence: 1.0 };
  }
}

export type { BusinessIntent as AiIntent };
