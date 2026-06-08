import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { ProfileService } from './profile.service';
import { DNAService } from '../../ai/dna/dna.service';
import { successResponse } from '../../core/utils/responseFormatter';

const profileService = new ProfileService();
const dnaService = new DNAService();

export class ProfileController {
  async getProfile(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const profile = await profileService.getProfile(uid);
    const dna = await dnaService.getDNA(uid);
    res.json(successResponse({ profile, dna }));
  }

  async upsertProfile(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const profile = await profileService.upsertProfile(uid, req.body);
    res.json(successResponse({ profile }));
  }
}

