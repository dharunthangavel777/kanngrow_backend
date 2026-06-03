import { getFirestore, collections } from '../core/config/firebase.config';
import { OpenAIProvider, ChatMessage } from '../ai/providers/openai.provider';
import { AIRouterService } from '../ai/router/aiRouter.service';
import { MemoryService } from '../ai/memory/memory.service';
import { ContextBuilder } from '../ai/context/contextBuilder';
import { ProfileService } from '../modules/profile/profile.service';
import { generateId, toTimestamp } from '../core/utils/helpers';
import { logger } from '../core/config/logger.config';

export interface ChatSessionDoc {
  id: string;
  uid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDoc {
  id: string;
  sessionId: string;
  uid: string;
  role: 'user' | 'assistant';
  content: string;
  usedModules?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
}

export class ChatService {
  private db = getFirestore();
  private ai = new OpenAIProvider();
  private router = new AIRouterService();
  private memory = new MemoryService();
  private contextBuilder = new ContextBuilder();
  private profileService = new ProfileService();

  async createSession(uid: string, title?: string): Promise<ChatSessionDoc> {
    const id = generateId();
    const session: ChatSessionDoc = {
      id,
      uid,
      title: title || 'New Chat',
      createdAt: toTimestamp(),
      updatedAt: toTimestamp(),
    };

    await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.chatSessions)
      .doc(id)
      .set(session);

    return session;
  }

  async getSessions(uid: string): Promise<ChatSessionDoc[]> {
    const snapshot = await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.chatSessions)
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((d: any) => d.data() as ChatSessionDoc);
  }

  async getSessionsWithRecent(uid: string): Promise<{ sessions: ChatSessionDoc[], recentMessages: MessageDoc[] }> {
    const sessions = await this.getSessions(uid);
    let recentMessages: MessageDoc[] = [];
    if (sessions.length > 0) {
      recentMessages = await this.getMessages(uid, sessions[0].id);
    }
    return { sessions, recentMessages };
  }

  async getMessages(uid: string, sessionId: string): Promise<MessageDoc[]> {
    const snapshot = await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.chatSessions)
      .doc(sessionId)
      .collection(collections.messages)
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get();

    return snapshot.docs.map((d: any) => d.data() as MessageDoc);
  }

  async sendMessage(
    uid: string,
    sessionId: string,
    userMessage: string,
  ): Promise<{ message: MessageDoc; usedModules: string[] }> {
    // 1. Detect intent
    const { intent, usedModules } = await this.router.detectIntent(userMessage);
    logger.debug(`Chat intent: ${intent}, modules: ${usedModules.join(', ')}`);

    // 2. Build context from profile + memory
    const [profile, facts] = await Promise.all([
      this.profileService.getProfile(uid),
      this.memory.getMemoryFacts(uid),
    ]);
    const { systemPrompt } = this.contextBuilder.build(profile, facts);

    // 3. Load recent history (last 10 messages)
    const history = await this.getMessages(uid, sessionId);
    const historyMessages: ChatMessage[] = history.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 4. Call OpenAI
    const aiContent = await this.ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
    });

    // 5. Save user message
    const userMsgId = generateId();
    const userMsg: MessageDoc = {
      id: userMsgId,
      sessionId,
      uid,
      role: 'user',
      content: userMessage,
      createdAt: toTimestamp(),
    };

    // 5. Generate Dynamic Metadata for Custom Cards
    const metadata: Record<string, any> = { usedModules };

    if (usedModules.includes('Product Idea Generator')) {
      try {
        const result = await this.ai.completeJSON<{ ideas: any[] }>({
          messages: [
            {
              role: 'system',
              content: 'You are an e-commerce sourcing expert. You must respond with a JSON object containing an "ideas" array. Each idea must exactly match this JSON schema: { "id": "string", "name": "string", "niche": "string", "targetCustomer": "string", "margin": "string (e.g. 80%)", "competition": "string (Low/Medium/High)", "sourcingPlatform": "string", "validationStrategy": "string", "uniqueAngle": "string", "viabilityScore": number (0 to 100) }'
            },
            { role: 'user', content: `Generate 3 distinct and creative product ideas for: ${userMessage}` }
          ],
          responseFormat: 'json'
        });
        metadata.ideas = result.ideas;
      } catch (err) {
        logger.warn(`Failed to generate metadata ideas: ${(err as Error).message}`);
      }
    }

    if (usedModules.includes('Product Validation')) {
      try {
        const result = await this.ai.completeJSON<any>({
          messages: [
            {
              role: 'system',
              content: 'You are an e-commerce validation assistant. You must respond with a JSON object containing "overallScore" (a number from 0 to 100) and a "nextSteps" array of strings representing validation tasks. Schema: { "overallScore": number, "nextSteps": string[] }'
            },
            { role: 'user', content: `Validate this e-commerce product concept: ${userMessage}` }
          ],
          responseFormat: 'json'
        });
        metadata.validation = result;
      } catch (err) {
        logger.warn(`Failed to validate product for metadata: ${(err as Error).message}`);
      }
    }

    if (usedModules.includes('E-commerce Roadmap') || usedModules.includes('Business Plan Generator')) {
      try {
        const result = await this.ai.completeJSON<any>({
          messages: [
            {
              role: 'system',
              content: 'You are an e-commerce business planner. You must respond with a JSON object containing a "milestones" array. Each milestone object must have a "phase" (string, e.g. "Week 1-2") and a "tasks" (array of strings). Schema: { "milestones": [ { "phase": "string", "tasks": ["string"] } ] }'
            },
            { role: 'user', content: `Create a step-by-step launch roadmap for: ${userMessage}` }
          ],
          responseFormat: 'json'
        });
        metadata.roadmap = result;
      } catch (err) {
        logger.warn(`Failed to generate roadmap for metadata: ${(err as Error).message}`);
      }
    }

    // 6. Save AI response
    const aiMsgId = generateId();
    const aiMsg: MessageDoc = {
      id: aiMsgId,
      sessionId,
      uid,
      role: 'assistant',
      content: aiContent,
      usedModules,
      metadata,
      createdAt: toTimestamp(),
    };

    const sessionRef = this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.chatSessions)
      .doc(sessionId);

    await Promise.all([
      sessionRef.collection(collections.messages).doc(userMsgId).set(userMsg),
      sessionRef.collection(collections.messages).doc(aiMsgId).set(aiMsg),
      sessionRef.update({ updatedAt: toTimestamp() }),
      // Extract memory facts async (non-blocking)
      this.memory.extractAndSaveFacts(uid, userMessage, aiContent),
    ]);

    return { message: aiMsg, usedModules };
  }
}
