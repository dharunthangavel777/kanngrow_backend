import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { ProfileService } from './profile.service';
import { successResponse } from '../../core/utils/responseFormatter';

const profileService = new ProfileService();

export class ProfileController {
  async getProfile(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const profile = await profileService.getProfile(uid);
    res.json(successResponse({ profile }));
  }

  async upsertProfile(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const profile = await profileService.upsertProfile(uid, req.body);
    res.json(successResponse({ profile }));
  }
}
