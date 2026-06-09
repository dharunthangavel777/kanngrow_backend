import { Request, Response } from 'express';
import { SubscriptionRequest } from '../core/middleware/subscription.middleware';
import { ChatService } from './chat.service';
import { successResponse } from '../core/utils/responseFormatter';
import { AppError } from '../core/middleware/error.middleware';

const chatService = new ChatService();

export class ChatController {
  async createSession(req: Request, res: Response): Promise<void> {
    const { uid } = req as SubscriptionRequest;
    const { title, isIdea } = req.body as { title?: string; isIdea?: boolean };
    const session = await chatService.createSession(uid, title, isIdea);
    res.status(201).json(successResponse({ session }));
  }

  async getSessions(req: Request, res: Response): Promise<void> {
    const { uid } = req as SubscriptionRequest;
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
    const { uid } = req as SubscriptionRequest;
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError('Session ID required', 400);
    const messages = await chatService.getMessages(uid, sessionId);
    res.json(successResponse({ messages }));
  }

  async getMemory(req: Request, res: Response): Promise<void> {
    const { uid } = req as SubscriptionRequest;
    const memory = await chatService.getMemory(uid);
    res.json(successResponse({ memory }));
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    const subReq = req as SubscriptionRequest;
    if (subReq.subscription && !subReq.subscription.features.chat) {
      res.status(403).json({
        success: false,
        error: 'Chat features are disabled on your current plan. Please upgrade.'
      });
      return;
    }
    const { uid } = subReq;
    const { sessionId } = req.params;
    const { message, model } = req.body as { message: string; model?: string };
    if (!message?.trim()) throw new AppError('Message cannot be empty', 400);

    const result = await chatService.sendMessage(uid, sessionId, message, model);
    res.json(successResponse(result));
  }

  async deleteSession(req: Request, res: Response): Promise<void> {
    const { uid } = req as SubscriptionRequest;
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError('Session ID required', 400);
    
    await chatService.deleteSession(uid, sessionId);
    res.json(successResponse({ message: 'Session deleted successfully' }));
  }
}
