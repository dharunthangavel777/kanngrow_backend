import { OpenAIProvider } from '../providers/openai.provider';
import { buildOnboardingSystemPrompt } from '../../core/utils/promptBuilder';
import { logger } from '../../core/config/logger.config';
import { getFirestore } from '../../core/config/firebase.config';
import crypto from 'crypto';

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

    // Build unique canonical sequence key from answered questions (ignoring names)
    const sequenceKey = Object.entries(answeredQuestions || {})
      .filter(([q]) => {
        const lowerQ = q.toLowerCase();
        return !lowerQ.includes('name') && !lowerQ.includes('full name');
      })
      .map(([q, a]) => `${q.trim()}:${a.trim()}`)
      .sort()
      .join('|');

    const docId = crypto.createHash('md5').update(sequenceKey).digest('hex');

    // Try to get question from database pool first
    try {
      const db = getFirestore();
      const cached = await db.collection('onboarding_questions').doc(docId).get();

      if (cached.exists) {
        const cachedData = cached.data();
        if (cachedData && cachedData.question) {
          logger.info(`Reusing onboarding question from cache for sequence: ${sequenceKey}`);
          
          const q = cachedData.question as OnboardingQuestion;
          return {
            ...q,
            stopAfterThis: q.stopAfterThis || questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS - 1,
          };
        }
      }
    } catch (err) {
      logger.warn(`Failed to lookup onboarding question cache: ${(err as Error).message}`);
    }

    // Generate new question using AI fallback
    try {
      logger.info(`Cache miss. Generating onboarding question using AI for sequence: ${sequenceKey}`);
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

      const newQuestion: OnboardingQuestion = {
        ...result,
        isDynamic: true,
        stopAfterThis: result.stopAfterThis || questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS - 1,
      };

      // Save to cache asynchronously so we don't block response
      const db = getFirestore();
      db.collection('onboarding_questions').doc(docId).set({
        sequenceKey,
        question: newQuestion,
        createdAt: new Date().toISOString(),
      }).catch((e) => logger.warn(`Failed to save onboarding question to cache: ${e.message}`));

      return newQuestion;
    } catch (err) {
      logger.error(`Question generation failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
