import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../core/middleware/auth.middleware';
import { ChatService } from './chat.service';
import { successResponse } from '../core/utils/responseFormatter';
import { AppError } from '../core/middleware/error.middleware';

const chatService = new ChatService();

export class ChatController {
  async createSession(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const { title, isIdea } = req.body as { title?: string; isIdea?: boolean };
    const session = await chatService.createSession(uid, title, isIdea);
    res.status(201).json(successResponse({ session }));
  }

  async getSessions(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const { includeRecent } = req.query;

    if (includeRecent === 'true') {
      const data = await chatService.getSessionsWithRecent(uid);
      res.json(successResponse(data));
    } else {
      const sessions = await chatService.getSessions(uid);
      res.json(successResponse({ sessions }));
    }
  }

  async getMessages(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError('Session ID required', 400);
    const messages = await chatService.getMessages(uid, sessionId);
    res.json(successResponse({ messages }));
  }

  async getMemory(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const memory = await chatService.getMemory(uid);
    res.json(successResponse({ memory }));
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    const { uid } = req as AuthenticatedRequest;
    const { sessionId } = req.params;
    const { message, model } = req.body as { message: string; model?: string };
    if (!message?.trim()) throw new AppError('Message cannot be empty', 400);

    const result = await chatService.sendMessage(uid, sessionId, message, model);
    res.json(successResponse(result));
  }
}
