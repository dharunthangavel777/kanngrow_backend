import { getFirestore, collections } from '../../core/config/firebase.config';
import { OpenAIProvider } from '../../ai/providers/openai.provider';
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

const VALIDATION_PROMPT = (productName: string, profileSummary: string) => `
You are an expert e-commerce viability analyst. Validate the product: "${productName}" for the Indian market, based on this founder's profile:
${profileSummary}

You MUST return the output as a valid JSON object matching this structure:
{
  "overallScore": 82,
  "verdict": "FEASIBLE",
  "dimensions": {
    "marketDemand": { "score": 85, "insight": "Clear rising search volume in urban hubs..." },
    "competition": { "score": 60, "insight": "Moderate density of price-tag sellers..." },
    "profitPotential": { "score": 80, "estimatedMargin": "55-65%", "insight": "Good sourcing margins at Surat wholesale hubs..." },
    "executionDifficulty": { "score": 75, "insight": "Standard packaging and parcel delivery..." },
    "riskLevel": { "score": 45, "insight": "Low shelf-life risks but high sizing return rates..." }
  },
  "topRisks": [
    "High return rate due to sizing issues",
    "Dependency on single wholesale supplier"
  ],
  "quickWins": [
    "Launch pre-orders on Instagram to test demand",
    "Source locally from wholesale markets to minimize bulk commitments"
  ],
  "verdict_detail": "A detailed 2-paragraph explanation of the final verdict, reasoning, and key recommendations."
}
`;

const COMPETITOR_ANALYSIS_PROMPT = (niche: string, profileSummary: string) => `
You are an expert market researcher. Perform a competitor analysis for the e-commerce niche: "${niche}" in India, based on this founder's profile:
${profileSummary}

You MUST return the output as a valid JSON object matching this structure:
{
  "marketOverview": "Summary of the competitor landscape in India for this niche.",
  "topCompetitors": [
    {
      "name": "Competitor Brand Name",
      "priceRange": "e.g. ₹599 - ₹1,499",
      "strengths": "Strong Instagram presence, premium packaging",
      "weaknesses": "Slow shipping times, generic product description"
    }
  ],
  "differentiationMoat": "Actionable strategy for how this founder can build a brand moat and stand out against competitors."
}
`;

export class ValidationService {
  private ai = new OpenAIProvider();
  private db = getFirestore();

  async validateProduct(uid: string, productName: string, profileSummary: string): Promise<ValidationScore> {
    try {
      logger.info(`🔍 Starting validation for: ${productName} (user: ${uid})`);

      const userSnap = await this.db.collection(collections.users).doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() as Record<string, any> : null;
      const tier = userData?.subscription?.tier ?? 'free';

      let tierDirective = '';
      if (tier === 'enterprise') {
        tierDirective = `\n[ENTERPRISE VALIDATION DIRECTIVES]
- Provide highly rigorous validation metrics specifically optimized for the Indian e-commerce landscape.
- Reference specific, established supply clusters (e.g. Surat for synthetic wear, Tiruppur for cotton knitwear, Ludhiana for cardigans, Kanpur/Agra for leather/shoes, Rajkot/Ahmedabad for industrial items).
- Highlight detailed risk profiles: e-commerce return rates in India (COD returns are often 35-50% on Shopify D2C), shipping transit losses, and platform commission margins.`;
      } else if (tier === 'premium') {
        tierDirective = `\n[PREMIUM VALIDATION DIRECTIVES]
- Focus on gross margin calculation, supplier reliability, and minimum budget required to test.
- Reference sourcing platforms (IndiaMART, local FPOs) and zero-CAC validation loops.`;
      }

      const summaryWithTier = `${profileSummary}${tierDirective}`;

      const result = await this.ai.completeJSON<ValidationScore>({
        messages: [{ role: 'user', content: VALIDATION_PROMPT(productName, summaryWithTier) }],
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

      const userSnap = await this.db.collection(collections.users).doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() as Record<string, any> : null;
      const tier = userData?.subscription?.tier ?? 'free';

      let tierDirective = '';
      if (tier === 'enterprise') {
        tierDirective = `\n[ENTERPRISE COMPETITORS DIRECTIVES]
- Focus on building a deep brand moat (exclusive supplier relationships, trademark/branding, customized packaging).
- Provide precise pricing maps for direct competitors, and SWOT analyses for major established players in India.`;
      } else if (tier === 'premium') {
        tierDirective = `\n[PREMIUM COMPETITORS DIRECTIVES]
- Focus on price positioning, packaging differentiators, and Instagram/organic marketing gaps.`;
      }

      const summaryWithTier = `${profileSummary}${tierDirective}`;

      const result = await this.ai.completeJSON<any>({
        messages: [{ role: 'user', content: COMPETITOR_ANALYSIS_PROMPT(niche, summaryWithTier) }],
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
