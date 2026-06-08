import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { QuestionGenerator } from './questionGenerator';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { successResponse } from '../../core/utils/responseFormatter';
import { toTimestamp } from '../../core/utils/helpers';
import { notificationService } from '../../core/services/notification.service';
import { logger } from '../../core/config/logger.config';
import { DNAService } from '../dna/dna.service';

const generator = new QuestionGenerator();
const dnaService = new DNAService();

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

    // Extract name if present
    const fullName = answers['What is your full name?'];

    const userUpdate: any = {
      onboardingComplete: true,
      updatedAt: toTimestamp(),
    };
    if (fullName) {
      userUpdate.displayName = fullName;
    }

    // Mark user onboarding complete
    await this.db.collection(collections.users).doc(uid).update(userUpdate);

    // Update User DNA completely from onboarding answers
    await dnaService.updateFromOnboarding(uid, answers);

    // Send Welcome / Onboarding Complete Notification
    notificationService.send({
      uid,
      type: 'user.onboarding_complete',
      title: '🚀 Welcome to Kanngrow!',
      body: 'Your AI Business Builder is ready. Let\'s build something amazing.',
      data: { userName: fullName || 'Entrepreneur' }
    }).catch((e) => logger.warn(`Failed to send onboarding welcome notification: ${e.message}`));

    res.json(successResponse({ message: 'Onboarding complete', answers }));
  }
}
