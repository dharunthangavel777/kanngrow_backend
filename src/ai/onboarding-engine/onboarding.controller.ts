import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { QuestionGenerator } from './questionGenerator';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { successResponse } from '../../core/utils/responseFormatter';
import { toTimestamp } from '../../core/utils/helpers';

const generator = new QuestionGenerator();

export class OnboardingController {
  private db = getFirestore();

  /**
   * POST /api/v1/onboarding/next-question
   * Flutter sends the answers so far; we return the next AI-generated question.
   */
  async getNextQuestion(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const { answeredQuestions, questionsAsked } = req.body as {
      answeredQuestions: Record<string, string>;
      questionsAsked: number;
    };

    const question = await generator.generateNextQuestion(answeredQuestions, questionsAsked, uid);
    res.json(successResponse({ question }));
  }

  /**
   * POST /api/v1/onboarding/complete
   * Saves all onboarding answers to Firestore and marks setup complete.
   */
  async completeOnboarding(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const { answers } = req.body as { answers: Record<string, string> };

    // Save onboarding state
    await this.db
      .collection(collections.onboardingState)
      .doc(uid)
      .set({ answers, completedAt: toTimestamp() });

    // Mark user onboarding complete
    await this.db.collection(collections.users).doc(uid).update({
      onboardingComplete: true,
      updatedAt: toTimestamp(),
    });

    res.json(successResponse({ message: 'Onboarding complete', answers }));
  }
}
