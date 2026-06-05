import { OpenAIProvider } from '../providers/openai.provider';
import { AI_INTENTS, AiIntent, MODULES } from '../../core/constants';
import { logger } from '../../core/config/logger.config';

interface RouterResult {
  intent: AiIntent;
  usedModules: string[];
  confidence: number;
}

export class AIRouterService {
  private ai = new OpenAIProvider();

  /**
   * Analyzes the user's message and routes it to the appropriate AI module(s).
   * This is the core "brain" of Kangrow AI.
   */
  async detectIntent(userMessage: string, uid = 'anonymous'): Promise<RouterResult> {
    try {
      const result = await this.ai.completeJSON<{
        intent: string;
        confidence: number;
      }>({
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier for an e-commerce AI platform. Classify the user's message into exactly one intent.

Available intents:
- ${AI_INTENTS.PRODUCT_DISCOVERY}: User wants product ideas, niche suggestions, or "what to sell"
- ${AI_INTENTS.PRODUCT_VALIDATION}: User wants to validate a specific product idea
- ${AI_INTENTS.COMPETITOR_ANALYSIS}: User wants to analyze competitors or the competitive landscape
- ${AI_INTENTS.MARKET_ANALYSIS}: User wants market research, trends, or demand analysis
- ${AI_INTENTS.BUSINESS_PLANNING}: User wants a business plan, roadmap, financial projection
- ${AI_INTENTS.GROWTH_COACHING}: User wants marketing tips, growth strategies, or scaling advice
- ${AI_INTENTS.GENERAL_CHAT}: General e-commerce questions or conversation

Respond ONLY with JSON: { "intent": "<intent_value>", "confidence": 0.95 }`,
          },
          { role: 'user', content: userMessage },
        ],
        responseFormat: 'json',
        maxTokens: 100,
        temperature: 0.1,
        uid,
        feature: 'ai-router',
      });

      const intent = (result.intent as AiIntent) || AI_INTENTS.GENERAL_CHAT;
      const usedModules = this.getModulesForIntent(intent);

      logger.debug(`Intent detected: ${intent} (${result.confidence})`);
      return { intent, usedModules, confidence: result.confidence };
    } catch {
      logger.warn('Intent detection failed, falling back to general_chat');
      return {
        intent: AI_INTENTS.GENERAL_CHAT,
        usedModules: [MODULES.AI_ROUTER],
        confidence: 0.5,
      };
    }
  }

  private getModulesForIntent(intent: AiIntent): string[] {
    const moduleMap: Record<AiIntent, string[]> = {
      [AI_INTENTS.PRODUCT_DISCOVERY]: [
        MODULES.IDEA_ENGINE,
        MODULES.MARKET_INTELLIGENCE,
        MODULES.AI_ROUTER,
      ],
      [AI_INTENTS.PRODUCT_VALIDATION]: [
        MODULES.VALIDATION_ENGINE,
        MODULES.COMPETITOR_ANALYSIS,
        MODULES.AI_ROUTER,
      ],
      [AI_INTENTS.COMPETITOR_ANALYSIS]: [
        MODULES.COMPETITOR_ANALYSIS,
        MODULES.MARKET_INTELLIGENCE,
      ],
      [AI_INTENTS.MARKET_ANALYSIS]: [
        MODULES.MARKET_INTELLIGENCE,
        MODULES.AI_ROUTER,
      ],
      [AI_INTENTS.BUSINESS_PLANNING]: [
        MODULES.BUSINESS_PLANNER,
        MODULES.ROADMAP_ENGINE,
      ],
      [AI_INTENTS.GROWTH_COACHING]: [MODULES.GROWTH_COACH],
      [AI_INTENTS.GENERAL_CHAT]: [MODULES.AI_ROUTER],
    };

    return moduleMap[intent] || [MODULES.AI_ROUTER];
  }
}
