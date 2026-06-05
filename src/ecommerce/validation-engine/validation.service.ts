import { getFirestore, collections } from '../../core/config/firebase.config';
import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { VALIDATION_PROMPT, COMPETITOR_ANALYSIS_PROMPT } from '../../ai/prompts/validation.prompt';
import { generateId, toTimestamp } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

export interface ValidationScore {
  overallScore: number;
  verdict: string;
  dimensions: {
    marketDemand: { score: number; insight: string };
    competition: { score: number; insight: string };
    profitPotential: { score: number; estimatedMargin: string; insight: string };
    executionDifficulty: { score: number; insight: string };
    riskLevel: { score: number; insight: string };
  };
  topRisks: string[];
  quickWins: string[];
  verdict_detail: string;
}

export class ValidationService {
  private ai = new OpenAIProvider();
  private db = getFirestore();

  async validateProduct(uid: string, productName: string, profileSummary: string): Promise<ValidationScore> {
    try {
      logger.info(`🔍 Starting validation for: ${productName} (user: ${uid})`);
      const result = await this.ai.completeJSON<ValidationScore>({
        messages: [{ role: 'user', content: VALIDATION_PROMPT(productName, profileSummary) }],
        responseFormat: 'json',
        maxTokens: 1500,
        uid,
        feature: 'validation',
      });

      // Save validation result to workspace
      const id = generateId();
      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.workspace)
        .doc(id)
        .set({
          id,
          type: 'validation',
          productName,
          data: result,
          createdAt: toTimestamp(),
        });

      logger.info(`✅ Validation complete and saved to workspace: ${id}`);
      return result;
    } catch (error) {
      logger.error(`Validation service error: ${(error as Error).message}`);
      throw new Error(`Failed to validate product: ${(error as Error).message}`);
    }
  }

  async analyzeCompetitors(uid: string, niche: string, profileSummary: string): Promise<any> {
    try {
      logger.info(`📊 Starting competitor analysis for: ${niche} (user: ${uid})`);
      const result = await this.ai.completeJSON<any>({
        messages: [{ role: 'user', content: COMPETITOR_ANALYSIS_PROMPT(niche, profileSummary) }],
        responseFormat: 'json',
        maxTokens: 1500,
        uid,
        feature: 'competitor-analysis',
      });

      // Save competitor analysis to workspace
      const id = generateId();
      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.workspace)
        .doc(id)
        .set({
          id,
          type: 'competitor_analysis',
          niche,
          data: result,
          createdAt: toTimestamp(),
        });

      logger.info(`✅ Competitor analysis complete and saved to workspace: ${id}`);
      return result;
    } catch (error) {
      logger.error(`Competitor analysis service error: ${(error as Error).message}`);
      throw new Error(`Failed to analyze competitors: ${(error as Error).message}`);
    }
  }
}
