import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../core/middleware/auth.middleware';
import { UsersService } from './users.service';
import { successResponse } from '../../core/utils/responseFormatter';

const usersService = new UsersService();

export class UsersController {
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uid } = req as AuthenticatedRequest;
      const user = await usersService.getUserById(uid);
      res.json(successResponse({ user }));
    } catch (error) {
      next(error);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uid } = req as AuthenticatedRequest;
      const user = await usersService.updateUser(uid, req.body);
      res.json(successResponse({ user }));
    } catch (error) {
      next(error);
    }
  }

  async deleteMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uid } = req as AuthenticatedRequest;
      await usersService.deleteUser(uid);
      res.json(successResponse({ message: 'Account deleted' }));
    } catch (error) {
      next(error);
    }
  }
}
