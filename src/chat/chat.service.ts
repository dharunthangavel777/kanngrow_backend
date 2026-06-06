import { getFirestore, collections } from '../core/config/firebase.config';
import { OpenAIProvider, ChatMessage, getPlatformSettings } from '../ai/providers/openai.provider';
import { AIRouterService } from '../ai/router/aiRouter.service';
import { MemoryService } from '../ai/memory/memory.service';
import { ContextBuilder } from '../ai/context/contextBuilder';
import { ProfileService } from '../modules/profile/profile.service';
import { KnowledgeSearchService } from '../knowledge/knowledge.search';
import { generateId, toTimestamp } from '../core/utils/helpers';
import { logger } from '../core/config/logger.config';
import { ValidationService } from '../ecommerce/validation-engine/validation.service';
import { BusinessPlanService } from '../ecommerce/business-planner/businessPlan.service';

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
  private knowledgeSearch = new KnowledgeSearchService();

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
    preferredModel?: string,
  ): Promise<{ message: MessageDoc; usedModules: string[] }> {
    // 1. Detect intent
    const { intent, usedModules } = await this.router.detectIntent(userMessage, uid);
    logger.debug(`Chat intent: ${intent}, modules: ${usedModules.join(', ')}`);

    // 2. Build context from user + profile + memory + knowledge base (RAG)
    const [userSnap, profile, facts, platformSettings] = await Promise.all([
      this.db.collection(collections.users).doc(uid).get(),
      this.profileService.getProfile(uid),
      this.memory.getMemoryFacts(uid),
      getPlatformSettings(),
    ]);
    const user = userSnap.exists ? userSnap.data() : null;
    const knowledgeResult = await this.knowledgeSearch.search(userMessage, profile);
    const knowledgeContext = this.knowledgeSearch.formatAsContext(knowledgeResult);
    const { systemPrompt, profileSummary, knowledgeInjected } = this.contextBuilder.build(profile, facts, knowledgeContext, user, intent);

    // 3. Load recent history — limit from platform config (default 6)
    const maxHistory = platformSettings.maxHistoryLimit ?? 6;
    const history = await this.getMessages(uid, sessionId);
    const historyMessages: ChatMessage[] = history.slice(-maxHistory).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Map client model selection to OpenAI model IDs
    let modelId: string | undefined;
    if (preferredModel === 'GPT-4') {
      modelId = 'gpt-4o';
    } else if (preferredModel === 'GPT-3.5') {
      modelId = 'gpt-3.5-turbo';
    } else if (preferredModel === 'Claude') {
      modelId = 'gpt-4o'; // fallback
    }

    // 4. Call OpenAI — pass uid + feature for cost tracking
    const aiContent = await this.ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
      uid,
      feature: 'chat',
      model: modelId,
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
    const metadata: Record<string, any> = { usedModules, knowledgeInjected };

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
          responseFormat: 'json',
          uid,
          feature: 'idea-generator',
        });
        metadata.ideas = result.ideas;
      } catch (err) {
        logger.warn(`Failed to generate metadata ideas: ${(err as Error).message}`);
      }
    }

    if (usedModules.includes('Product Validation')) {
      try {
        const validationService = new ValidationService();
        const result = await validationService.validateProduct(uid, userMessage, profileSummary);
        metadata.validation = result;
      } catch (err) {
        logger.warn(`Failed to validate product for metadata: ${(err as Error).message}`);
      }
    }

    if (usedModules.includes('E-commerce Roadmap') || usedModules.includes('Business Plan Generator')) {
      try {
        const businessPlanService = new BusinessPlanService();
        if (usedModules.includes('Business Plan Generator')) {
          const result = await businessPlanService.generateBusinessPlan(uid, profileSummary);
          metadata.roadmap = {
            milestones: [
              {
                phase: 'Executive Summary',
                tasks: [result.plan.executiveSummary || '']
              },
              {
                phase: 'Revenue Model',
                tasks: [
                  `Primary Stream: ${result.plan.revenueModel?.primaryStream || ''}`,
                  `Projected Year 1 Revenue: ${result.plan.revenueModel?.projectedYear1Revenue || ''}`,
                  `Pricing Strategy: ${result.plan.revenueModel?.pricingStrategy || ''}`
                ]
              },
              {
                phase: 'Marketing Strategy',
                tasks: [
                  `CAC Estimate: ${result.plan.marketingStrategy?.cac || ''}`,
                  `Budget: ${result.plan.marketingStrategy?.budget || ''}`,
                  ...(result.plan.marketingStrategy?.channels || [])
                ]
              }
            ]
          };
        } else {
          const goal = profile?.goal || 'Build a profitable store';
          const result = await businessPlanService.generateRoadmap(uid, profileSummary, goal);
          metadata.roadmap = result.roadmap;
        }
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
