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

    // Step 1: Parallel data fetch — all Firestore + Web Search concurrently!
    const [userSnap, dna, memoryTiers, platformSettings, searchResult] = await Promise.all([
      this.db.collection(collections.users).doc(uid).get(),
      this.dnaService.getOrCreateDNA(uid),
      this.memory.getMemoryTiers(uid),
      getPlatformSettings(),
      this.searchService.searchWeb(userMessage),
    ]);

    const userData = userSnap.exists ? userSnap.data() as Record<string, unknown> : null;

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

    // Step 5: Resolve model based on subscription tier (Enterprise/Premium get gpt-4o, Standard/Free get gpt-4o-mini)
    let modelId: string | undefined;
    if (preferredModel === 'GPT-4' || tier === 'enterprise' || tier === 'premium') {
      modelId = 'gpt-4o';
    } else if (preferredModel === 'GPT-3.5') {
      modelId = 'gpt-3.5-turbo';
    } else {
      modelId = 'gpt-4o-mini';
    }
    // Default: gpt-4o-mini (fast, affordable, excellent for most queries)

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
      createdAt: toTimestamp(),
    };

    const aiMsgId = generateId();
    const aiMsg: MessageDoc = {
      id: aiMsgId, sessionId, uid,
      role: 'assistant', content: aiContent,
      intent, language: languageProfile.detected,
      metadata: { language: languageProfile.detected, intent, latencyMs, niche },
      createdAt: toTimestamp(),
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
}

