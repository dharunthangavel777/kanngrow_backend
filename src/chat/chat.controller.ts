import { Request, Response } from 'express';
import { SubscriptionRequest } from '../core/middleware/subscription.middleware';
import { ChatService } from './chat.service';
import { successResponse } from '../core/utils/responseFormatter';
import { AppError } from '../core/middleware/error.middleware';
import { logger } from '../core/config/logger.config';

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
    const { message, model, stream } = req.body as { message: string; model?: string; stream?: boolean };
    if (!message?.trim()) throw new AppError('Message cannot be empty', 400);

    if (stream === true) {
      try {
        const streamInfo = await chatService.sendMessageStream(uid, sessionId, message, model);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send metadata first
        res.write(`data: ${JSON.stringify({
          type: 'meta',
          userMessageId: streamInfo.userMsgId,
          assistantMessageId: streamInfo.aiMsgId,
          searchResult: streamInfo.searchResult,
        })}\n\n`);

        let fullContent = '';
        let promptTokens = 0;
        let completionTokens = 0;

        for await (const chunk of streamInfo.stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullContent += text;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
          }
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens || 0;
            completionTokens = chunk.usage.completion_tokens || 0;
          }
        }

        res.write('data: [DONE]\n\n');
        res.end();

        // Save messages and run background learning in the background
        chatService.saveStreamedMessages(
          uid,
          sessionId,
          message,
          fullContent,
          streamInfo.userMsgId,
          streamInfo.aiMsgId,
          streamInfo.intent,
          streamInfo.language,
          streamInfo.modelId,
          streamInfo.startTime,
          promptTokens,
          completionTokens,
        ).catch(err => {
          logger.error(`Error saving streamed messages: ${err.message}`);
        });
      } catch (err) {
        logger.error(`Streaming failed: ${(err as Error).message}`);
        res.status(500).json({ success: false, error: 'Streaming generation failed' });
      }
    } else {
      const result = await chatService.sendMessage(uid, sessionId, message, model);
      res.json(successResponse(result));
    }
  }

  async deleteSession(req: Request, res: Response): Promise<void> {
    const { uid } = req as SubscriptionRequest;
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError('Session ID required', 400);
    
    await chatService.deleteSession(uid, sessionId);
    res.json(successResponse({ message: 'Session deleted successfully' }));
  }
}
