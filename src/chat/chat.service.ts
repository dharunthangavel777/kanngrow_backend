import { getFirestore, collections } from '../core/config/firebase.config';
import { OpenAIProvider, ChatMessage, getPlatformSettings } from '../ai/providers/openai.provider';
import { AIRouterService } from '../ai/router/aiRouter.service';
import { MemoryService } from '../ai/memory/memory.service';
import { ContextBuilder } from '../ai/context/contextBuilder';
import { ProfileService } from '../modules/profile/profile.service';
import { DNAService } from '../ai/dna/dna.service';
import { SearchService } from '../ai/search/search.service';
import { DecisionMemory } from '../ai/decision/decision.memory';
import { detectLanguage } from '../ai/language/language.engine';
import { generateId, toTimestamp } from '../core/utils/helpers';
import { logger } from '../core/config/logger.config';

// ── Chat Service V2 — Single-Call Pipeline ─────────────────────────────────────
// One OpenAI call per message. Everything else resolves in parallel from Firestore.
// Background learning runs non-blocking after user gets their response.

export interface ChatSessionDoc {
  id: string;
  uid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isIdea?: boolean;
}

export interface MessageDoc {
  id: string;
  sessionId: string;
  uid: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  language?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export class ChatService {
  private db             = getFirestore();
  private ai             = new OpenAIProvider();
  private router         = new AIRouterService();
  private memory         = new MemoryService();
  private contextBuilder = new ContextBuilder();
  private profileService = new ProfileService();
  private dnaService     = new DNAService();
  private decisionMem    = new DecisionMemory();
  private searchService  = new SearchService();

  // ── In-Process Cache (5-min TTL) — reduces Firestore reads per message ──────
  private static _userCache = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private getCachedUser(uid: string): Record<string, unknown> | null {
    const entry = ChatService._userCache.get(uid);
    if (!entry || Date.now() > entry.expiresAt) {
      ChatService._userCache.delete(uid);
      return null;
    }
    return entry.data;
  }

  private setCachedUser(uid: string, data: Record<string, unknown>): void {
    ChatService._userCache.set(uid, { data, expiresAt: Date.now() + ChatService.CACHE_TTL_MS });
  }

  // ── Session Management ──────────────────────────────────────────────────────

  async createSession(uid: string, title?: string, isIdea?: boolean): Promise<ChatSessionDoc> {
    const id = generateId();
    const session: ChatSessionDoc = {
      id, uid, title: title || 'New Chat',
      createdAt: toTimestamp(), updatedAt: toTimestamp(),
      isIdea: isIdea || false,
    };
    await this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions).doc(id).set(session);
    return session;
  }

  async getSessions(uid: string): Promise<ChatSessionDoc[]> {
    const snap = await this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions)
      .orderBy('updatedAt', 'desc').limit(20).get();
    return snap.docs.map((d: any) => d.data() as ChatSessionDoc);
  }

  async getSessionsWithRecent(uid: string): Promise<{ sessions: ChatSessionDoc[]; recentMessages: MessageDoc[] }> {
    const sessions = await this.getSessions(uid);
    let recentMessages: MessageDoc[] = [];
    if (sessions.length > 0) recentMessages = await this.getMessages(uid, sessions[0].id);
    return { sessions, recentMessages };
  }

  async getMessages(uid: string, sessionId: string): Promise<MessageDoc[]> {
    const snap = await this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions).doc(sessionId)
      .collection(collections.messages)
      .orderBy('createdAt', 'asc').limit(60).get();
    return snap.docs.map((d: any) => d.data() as MessageDoc);
  }

  async deleteSession(uid: string, sessionId: string): Promise<void> {
    const msgsSnap = await this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions).doc(sessionId)
      .collection(collections.messages).limit(100).get();
    const batch = this.db.batch();
    msgsSnap.docs.forEach((d: any) => batch.delete(d.ref));
    batch.delete(this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions).doc(sessionId));
    await batch.commit();
  }

  // ── V2 Single-Call Message Pipeline ─────────────────────────────────────────
  async sendMessage(
    uid: string,
    sessionId: string,
    userMessage: string,
    preferredModel?: string,
  ): Promise<{ message: MessageDoc; intent: string; language: string }> {
    const startTime = Date.now();

    // Step 1: Parallel data fetch — cache-first for user profile, all else concurrent!
    const cachedUser = this.getCachedUser(uid);
    const [userSnap, dna, memoryTiers, platformSettings, searchResult] = await Promise.all([
      cachedUser ? Promise.resolve(null) : this.db.collection(collections.users).doc(uid).get(),
      this.dnaService.getOrCreateDNA(uid),
      this.memory.getMemoryTiers(uid),
      getPlatformSettings(),
      this.searchService.searchWeb(userMessage),
    ]);

    let userData: Record<string, unknown> | null = cachedUser;
    if (!userData && userSnap && userSnap.exists) {
      userData = userSnap.data() as Record<string, unknown>;
      this.setCachedUser(uid, userData); // warm the cache
    }

    // Step 2: Fast classifiers (0ms, no API calls)
    const { intent, niche } = this.router.detectIntent(userMessage);
    const languageProfile   = detectLanguage(userMessage);

    logger.debug(`[V2] uid=${uid} intent=${intent} lang=${languageProfile.detected} niche=${niche}`);

    const tier = (userData as any)?.subscription?.tier ?? 'free';

    // Step 3: Build system prompt (async, uses cached data)
    const mergedDna = { ...dna, name: (userData?.displayName as string) || (userData?.name as string) || dna.name };
    let systemPrompt = await this.contextBuilder.build(mergedDna, memoryTiers, languageProfile, intent, uid, tier);

    // Inject Web Search Context
    if (searchResult.sources.length > 0 || searchResult.imageUrl) {
      const searchContextPrompt = `
\n[WEB SEARCH CONTEXT]
The following verified web search results were found for the user's message:
${searchResult.sources.map((s, idx) => `Source ${idx + 1}: Title: "${s.title}", URL: "${s.url}"`).join('\n')}
${searchResult.imageUrl ? `Image URL: "${searchResult.imageUrl}"` : ''}

INSTRUCTIONS:
1. Incorporate this web search context to answer the user's message accurately.
2. At the very bottom of your response, list the sources under a "Sources" heading. Use markdown links, e.g. "- [Title](URL)". Do not make up URLs. Only use the verified URLs from the search context.
3. If an Image URL is provided in the search context, embed the image on its own separate line anywhere in your response using markdown: "![Image Description](ImageURL)". Ensure the image markdown is on its own separate line.
`;
      systemPrompt += searchContextPrompt;
    }

    // Step 4: Load recent conversation history
    const maxHistory = (platformSettings?.maxHistoryLimit as number) ?? 8;
    const history = await this.getMessages(uid, sessionId);
    const historyMessages: ChatMessage[] = history.slice(-maxHistory).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Step 5: Resolve model based on allowed models from user subscription
    const allowedModels = (userData as any)?.subscription?.allowedModels || ['gpt-4o-mini', 'gpt-3.5-turbo'];
    let modelId = preferredModel;

    // Validate that the requested model is actually allowed for this user's subscription
    if (!modelId || !allowedModels.includes(modelId)) {
      modelId = allowedModels.includes('gpt-4o-mini') ? 'gpt-4o-mini' : allowedModels[0];
    }

    // Step 6: THE ONE AI CALL ────────────────────────────────────────────────
    const aiContent = await this.ai.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
      uid,
      feature: 'chat-v2',
      model: modelId,
      maxTokens: 900,
      temperature: 0.72,
    });

    const latencyMs = Date.now() - startTime;
    logger.info(`[V2] Completed in ${latencyMs}ms — 1 AI call — intent: ${intent}`);

    // Step 7: Save both messages
    const userMsgId = generateId();
    const userMsg: MessageDoc = {
      id: userMsgId, sessionId, uid,
      role: 'user', content: userMessage,
      intent, language: languageProfile.detected,
      createdAt: new Date(startTime).toISOString(),
    };

    const aiMsgId = generateId();
    const aiMsg: MessageDoc = {
      id: aiMsgId, sessionId, uid,
      role: 'assistant', content: aiContent,
      intent, language: languageProfile.detected,
      metadata: { language: languageProfile.detected, intent, latencyMs, niche },
      createdAt: new Date(Math.max(Date.now(), startTime + 10)).toISOString(),
    };

    const sessionRef = this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions).doc(sessionId);

    await Promise.all([
      sessionRef.collection(collections.messages).doc(userMsgId).set(userMsg),
      sessionRef.collection(collections.messages).doc(aiMsgId).set(aiMsg),
      sessionRef.update({ updatedAt: toTimestamp() }),
    ]);

    // Step 8: Background learning — non-blocking, NEVER delays response
    this.runBackgroundLearning(uid, userMessage, aiContent, sessionId, dna.totalMessages || 0);

    return { message: aiMsg, intent, language: languageProfile.detected };
  }

  // ── Background Learning ──────────────────────────────────────────────────────
  // Runs after user gets their response. Zero latency impact.
  private runBackgroundLearning(
    uid: string,
    userMessage: string,
    aiReply: string,
    sessionId: string,
    totalMessages: number,
  ): void {
    Promise.all([
      this.dnaService.updateFromExchange(uid, userMessage, aiReply),
      this.memory.extractAndSave(uid, userMessage, aiReply),
      this.decisionMem.extractFromExchange(uid, userMessage, sessionId),
    ]).then(() => {
      if (totalMessages > 0 && totalMessages % 10 === 0) {
        this.memory.summarizeToLongTerm(uid).catch(e =>
          logger.warn(`Long-term summarization failed: ${e.message}`)
        );
      }
    }).catch(err =>
      logger.warn(`Background learning error for ${uid}: ${(err as Error).message}`)
    );
  }

  async getMemory(uid: string): Promise<any> {
    return this.memory.getMemoryTiers(uid);
  }

  async sendMessageStream(
    uid: string,
    sessionId: string,
    userMessage: string,
    preferredModel?: string,
  ): Promise<{
    userMsgId: string;
    aiMsgId: string;
    stream: any;
    intent: string;
    language: string;
    searchResult: any;
    startTime: number;
    modelId: string;
  }> {
    const startTime = Date.now();

    // Step 1: Parallel data fetch — cache-first for user profile, all else concurrent!
    const cachedUser = this.getCachedUser(uid);
    const [userSnap, dna, memoryTiers, platformSettings, searchResult] = await Promise.all([
      cachedUser ? Promise.resolve(null) : this.db.collection(collections.users).doc(uid).get(),
      this.dnaService.getOrCreateDNA(uid),
      this.memory.getMemoryTiers(uid),
      getPlatformSettings(),
      this.searchService.searchWeb(userMessage),
    ]);

    let userData: Record<string, unknown> | null = cachedUser;
    if (!userData && userSnap && userSnap.exists) {
      userData = userSnap.data() as Record<string, unknown>;
      this.setCachedUser(uid, userData); // warm the cache
    }

    // Step 2: Fast classifiers (0ms, no API calls)
    const { intent, niche } = this.router.detectIntent(userMessage);
    const languageProfile   = detectLanguage(userMessage);

    logger.debug(`[V2 Stream] uid=${uid} intent=${intent} lang=${languageProfile.detected} niche=${niche}`);

    const tier = (userData as any)?.subscription?.tier ?? 'free';

    // Step 3: Build system prompt (async, uses cached data)
    const mergedDna = { ...dna, name: (userData?.displayName as string) || (userData?.name as string) || dna.name };
    let systemPrompt = await this.contextBuilder.build(mergedDna, memoryTiers, languageProfile, intent, uid, tier);

    // Inject Web Search Context
    if (searchResult.sources.length > 0 || searchResult.imageUrl) {
      const searchContextPrompt = `
\n[WEB SEARCH CONTEXT]
The following verified web search results were found for the user's message:
${searchResult.sources.map((s, idx) => `Source ${idx + 1}: Title: "${s.title}", URL: "${s.url}"`).join('\n')}
${searchResult.imageUrl ? `Image URL: "${searchResult.imageUrl}"` : ''}

INSTRUCTIONS:
1. Incorporate this web search context to answer the user's message accurately.
2. At the very bottom of your response, list the sources under a "Sources" heading. Use markdown links, e.g. "- [Title](URL)". Do not make up URLs. Only use the verified URLs from the search context.
3. If an Image URL is provided in the search context, embed the image on its own separate line anywhere in your response using markdown: "![Image Description](ImageURL)". Ensure the image markdown is on its own separate line.
`;
      systemPrompt += searchContextPrompt;
    }

    // Step 4: Load recent conversation history
    const maxHistory = (platformSettings?.maxHistoryLimit as number) ?? 8;
    const history = await this.getMessages(uid, sessionId);
    const historyMessages: ChatMessage[] = history.slice(-maxHistory).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Step 5: Resolve model based on allowed models from user subscription
    const allowedModels = (userData as any)?.subscription?.allowedModels || ['gpt-4o-mini', 'gpt-3.5-turbo'];
    let modelId: string = preferredModel || '';

    // Validate that the requested model is actually allowed for this user's subscription
    if (!modelId || !allowedModels.includes(modelId)) {
      modelId = allowedModels.includes('gpt-4o-mini') ? 'gpt-4o-mini' : allowedModels[0];
    }

    // Step 6: THE STREAM CALL ────────────────────────────────────────────────
    const stream = await this.ai.completeStream({
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
      uid,
      feature: 'chat-v2-stream',
      model: modelId,
      maxTokens: 900,
      temperature: 0.72,
    });

    const userMsgId = generateId();
    const aiMsgId = generateId();

    return {
      userMsgId,
      aiMsgId,
      stream,
      intent,
      language: languageProfile.detected,
      searchResult,
      startTime,
      modelId,
    };
  }

  async saveStreamedMessages(
    uid: string,
    sessionId: string,
    userMessage: string,
    aiContent: string,
    userMsgId: string,
    aiMsgId: string,
    intent: string,
    language: string,
    modelId: string,
    startTime: number,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    const latencyMs = Date.now() - startTime;
    logger.info(`[V2 Stream] Completed in ${latencyMs}ms — intent: ${intent}`);

    const userMsg: MessageDoc = {
      id: userMsgId, sessionId, uid,
      role: 'user', content: userMessage,
      intent, language,
      createdAt: new Date(startTime).toISOString(),
    };

    const aiMsg: MessageDoc = {
      id: aiMsgId, sessionId, uid,
      role: 'assistant', content: aiContent,
      intent, language,
      metadata: { language, intent, latencyMs, model: modelId },
      createdAt: new Date(Math.max(Date.now(), startTime + 10)).toISOString(),
    };

    const sessionRef = this.db.collection(collections.users).doc(uid)
      .collection(collections.chatSessions).doc(sessionId);

    await Promise.all([
      sessionRef.collection(collections.messages).doc(userMsgId).set(userMsg),
      sessionRef.collection(collections.messages).doc(aiMsgId).set(aiMsg),
      sessionRef.update({ updatedAt: toTimestamp() }),
    ]);

    // Background learning
    const dna = await this.dnaService.getOrCreateDNA(uid);
    this.runBackgroundLearning(uid, userMessage, aiContent, sessionId, dna.totalMessages || 0);

    // Log OpenAI usage cost
    const totalTokens = promptTokens + completionTokens;
    const pricing = {
      'gpt-4o':          { input: 5.00,   output: 15.00 },
      'gpt-4o-mini':     { input: 0.15,   output: 0.60  },
      'gpt-4':           { input: 30.00,  output: 60.00 },
      'gpt-3.5-turbo':   { input: 0.50,   output: 1.50  },
    };
    const modelPricing = (pricing as any)[modelId] ?? pricing['gpt-4o-mini'];
    const cost = (promptTokens * modelPricing.input + completionTokens * modelPricing.output) / 1_000_000;
    
    this.ai.logUsage({
      uid,
      feature: 'chat-v2-stream',
      model: modelId,
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
      status: 'success',
      latencyMs,
    });
  }
}

