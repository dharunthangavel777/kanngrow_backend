import { getOpenAI, openaiConfig } from '../../core/config/openai.config';
import { logger } from '../../core/config/logger.config';
import { getFirestore, collections } from '../../core/config/firebase.config';

// ── Model Pricing (per 1M tokens) ─────────────────────────────────────────────
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':          { input: 5.00,   output: 15.00 },
  'gpt-4o-mini':     { input: 0.15,   output: 0.60  },
  'gpt-4':           { input: 30.00,  output: 60.00 },
  'gpt-3.5-turbo':   { input: 0.50,   output: 1.50  },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini'];
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

// ── Platform Config Cache (refreshed every 60s to avoid Firestore over-read) ──
interface OpenAISettings {
  maxHistoryLimit:     number;   // how many history messages to pass in chat
  maxTokensMultiplier: number;   // multiply configured maxTokens by this factor
  tierDownModel:       boolean;  // if true, force gpt-4o-mini
}

let _settingsCache: OpenAISettings | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 60_000;

async function getOpenAISettings(): Promise<OpenAISettings> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL_MS) {
    return _settingsCache;
  }
  try {
    const db = getFirestore();
    const snap = await db
      .collection(collections.platform_config)
      .doc('openai_settings')
      .get();
    if (snap.exists) {
      _settingsCache = snap.data() as OpenAISettings;
    } else {
      // Seed defaults if not present
      const defaults: OpenAISettings = {
        maxHistoryLimit: 6,
        maxTokensMultiplier: 1.0,
        tierDownModel: false,
      };
      await db
        .collection(collections.platform_config)
        .doc('openai_settings')
        .set(defaults);
      _settingsCache = defaults;
    }
  } catch (err) {
    logger.warn(`Could not read openai_settings: ${(err as Error).message}`);
    _settingsCache = { maxHistoryLimit: 6, maxTokensMultiplier: 1.0, tierDownModel: false };
  }
  _settingsCacheAt = now;
  return _settingsCache!;
}

// Export so chat.service.ts can read maxHistoryLimit without a second Firestore round-trip
export async function getPlatformSettings(): Promise<OpenAISettings> {
  return getOpenAISettings();
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages:       ChatMessage[];
  model?:         string;
  maxTokens?:     number;
  temperature?:   number;
  responseFormat?: 'text' | 'json';
  /** Caller uid for cost logging (pass 'system' for background jobs) */
  uid?:           string;
  /** Feature/module name for cost breakdown logging */
  feature?:       string;
}

export class OpenAIProvider {
  private client = getOpenAI();

  async complete(options: CompletionOptions): Promise<string> {
    const settings = await getOpenAISettings();

    const {
      messages,
      temperature = openaiConfig.temperature,
      responseFormat = 'text',
      uid = 'anonymous',
      feature = 'unknown',
    } = options;

    // Apply platform overrides
    let model = options.model ?? openaiConfig.model;
    if (settings.tierDownModel) model = 'gpt-4o-mini';

    let maxTokens = options.maxTokens ?? openaiConfig.maxTokens;
    maxTokens = Math.ceil(maxTokens * settings.maxTokensMultiplier);

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(responseFormat === 'json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI');

      // ── Token & Cost Logging ─────────────────────────────
      const promptTokens     = response.usage?.prompt_tokens     ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;
      const totalTokens      = response.usage?.total_tokens      ?? 0;
      const cost             = estimateCost(model, promptTokens, completionTokens);

      logger.debug(
        `OpenAI [${feature}] uid=${uid} model=${model} tokens=${totalTokens} cost=$${cost.toFixed(6)}`
      );

      // Non-blocking fire-and-forget write to Firestore
      this._logUsage({ uid, feature, model, promptTokens, completionTokens, totalTokens, cost });

      return content;
    } catch (error) {
      logger.error(`OpenAI error: ${(error as Error).message}`);
      throw error;
    }
  }

  async completeJSON<T>(options: CompletionOptions): Promise<T> {
    const text = await this.complete({ ...options, responseFormat: 'json' });
    return JSON.parse(text) as T;
  }

  private _logUsage(data: {
    uid: string; feature: string; model: string;
    promptTokens: number; completionTokens: number; totalTokens: number; cost: number;
  }): void {
    try {
      const db = getFirestore();
      const docId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      db.collection(collections.openai_usage_logs)
        .doc(docId)
        .set({ ...data, createdAt: new Date().toISOString() })
        .catch((err: Error) => logger.warn(`Usage log write failed: ${err.message}`));
    } catch (err) {
      // Never throw from log path
      logger.warn(`_logUsage setup failed: ${(err as Error).message}`);
    }
  }
}
