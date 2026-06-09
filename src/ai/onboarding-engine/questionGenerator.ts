import { OpenAIProvider } from '../providers/openai.provider';
import { buildOnboardingSystemPrompt } from '../../core/utils/promptBuilder';
import { logger } from '../../core/config/logger.config';

export interface OnboardingQuestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'text' | 'single' | 'multi' | 'text_search';
  options: Array<{ title: string; desc: string }>;
  isDynamic: boolean;
  stopAfterThis?: boolean;
}

export class QuestionGenerator {
  private ai = new OpenAIProvider();

  // Maximum AI-generated questions (after static name + location = 2 static)
  private static readonly MAX_AI_QUESTIONS = 15;

  /**
   * Generates the next personalized onboarding question using gpt-4o-mini.
   * Returns null when the profile is considered complete (>= MAX_AI_QUESTIONS asked
   * or the AI signals stopAfterThis).
   */
  async generateNextQuestion(
    answeredQuestions: Record<string, string>,
    questionsAsked: number,
    uid = 'anonymous',
  ): Promise<OnboardingQuestion | null> {
    if (questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS) return null;

    try {
      const result = await this.ai.completeJSON<{
        id: string;
        title: string;
        subtitle: string;
        type: 'text' | 'single' | 'multi';
        options: Array<{ title: string; desc: string }>;
        stopAfterThis: boolean;
      }>({
        messages: [
          {
            role: 'system',
            content: buildOnboardingSystemPrompt(answeredQuestions, questionsAsked),
          },
          {
            role: 'user',
            content: 'Generate the next onboarding question.',
          },
        ],
        responseFormat: 'json',
        maxTokens: 300,
        temperature: 0.7,
        uid,
        feature: 'onboarding',
        model: 'gpt-4o-mini',
      });

      if (!result || !result.title) return null;

      return {
        ...result,
        isDynamic: true,
        stopAfterThis: result.stopAfterThis || questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS - 1,
      };
    } catch (err) {
      logger.warn(`Question generation failed: ${(err as Error).message}`);
      return null;
    }
  }
}
