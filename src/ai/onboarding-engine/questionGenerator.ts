import { OpenAIProvider } from '../providers/openai.provider';
import { buildOnboardingSystemPrompt } from '../../core/utils/promptBuilder';
import { logger } from '../../core/config/logger.config';

export interface OnboardingQuestion {
  title: string;
  subtitle: string;
  options: Array<{ title: string; desc: string }>;
  isDynamic: boolean;
}

export class QuestionGenerator {
  private ai = new OpenAIProvider();

  /**
   * Generates the next personalized onboarding question using the AI,
   * based on what the user has already answered.
   */
  async generateNextQuestion(
    answeredQuestions: Record<string, string>,
    questionsAsked: number,
    uid = 'anonymous',
  ): Promise<OnboardingQuestion | null> {
    // Only generate up to 3 dynamic questions total
    if (questionsAsked >= 3) return null;

    try {
      const result = await this.ai.completeJSON<{
        title: string;
        subtitle: string;
        options: Array<{ title: string; desc: string }>;
      }>({
        messages: [
          {
            role: 'system',
            content: buildOnboardingSystemPrompt(answeredQuestions),
          },
          {
            role: 'user',
            content: 'Generate the next most valuable personalized question for this user.',
          },
        ],
        responseFormat: 'json',
        maxTokens: 512,
        temperature: 0.8,
        uid,
        feature: 'onboarding',
      });

      return {
        ...result,
        isDynamic: true,
      };
    } catch (err) {
      logger.warn(`Question generation failed: ${(err as Error).message}`);
      return null;
    }
  }
}
