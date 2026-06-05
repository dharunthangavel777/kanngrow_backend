import { getFirestore, collections } from '../../core/config/firebase.config';
import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { BUSINESS_PLAN_PROMPT, ROADMAP_PROMPT } from '../../ai/prompts/roadmap.prompt';
import { generateId, toTimestamp } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

export class BusinessPlanService {
  private ai = new OpenAIProvider();
  private db = getFirestore();

  async generateBusinessPlan(uid: string, profileSummary: string): Promise<{ id: string; plan: any }> {
    try {
      logger.info(`📝 Generating business plan for user: ${uid}`);
      const result = await this.ai.completeJSON<any>({
        messages: [{ role: 'user', content: BUSINESS_PLAN_PROMPT(profileSummary) }],
        responseFormat: 'json',
        maxTokens: 2000,
        uid,
        feature: 'business-planner',
      });

      const id = generateId();
      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.workspace)
        .doc(id)
        .set({
          id,
          type: 'business_plan',
          data: result,
          createdAt: toTimestamp(),
        });

      logger.info(`✅ Business plan saved: ${id}`);
      return { id, plan: result };
    } catch (error) {
      logger.error(`BusinessPlanService.generateBusinessPlan error: ${(error as Error).message}`);
      throw new Error(`Failed to generate business plan: ${(error as Error).message}`);
    }
  }

  async generateRoadmap(uid: string, profileSummary: string, goal: string): Promise<{ id: string; roadmap: any }> {
    try {
      logger.info(`🗺️ Generating 90-day roadmap for user: ${uid} (Goal: ${goal})`);
      const result = await this.ai.completeJSON<any>({
        messages: [{ role: 'user', content: ROADMAP_PROMPT(profileSummary, goal) }],
        responseFormat: 'json',
        maxTokens: 2000,
        uid,
        feature: 'roadmap',
      });

      const id = generateId();
      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.workspace)
        .doc(id)
        .set({
          id,
          type: 'roadmap',
          data: result,
          createdAt: toTimestamp(),
        });

      logger.info(`✅ Launch roadmap saved: ${id}`);
      return { id, roadmap: result };
    } catch (error) {
      logger.error(`BusinessPlanService.generateRoadmap error: ${(error as Error).message}`);
      throw new Error(`Failed to generate roadmap: ${(error as Error).message}`);
    }
  }
}
