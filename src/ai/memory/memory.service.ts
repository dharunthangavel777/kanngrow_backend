import { getFirestore, collections } from '../../core/config/firebase.config';
import { OpenAIProvider } from '../providers/openai.provider';
import { toTimestamp, generateId } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

export interface MemoryFact {
  id: string;
  uid: string;
  fact: string;
  category: 'product' | 'audience' | 'budget' | 'goal' | 'decision' | 'general';
  confidence: number; // 0-1
  source: 'chat' | 'onboarding' | 'manual';
  createdAt: string;
}

export class MemoryService {
  private db = getFirestore();
  private ai = new OpenAIProvider();

  async getMemoryFacts(uid: string): Promise<MemoryFact[]> {
    const snapshot = await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.memory)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((d) => d.data() as MemoryFact);
  }

  async addFact(uid: string, fact: Omit<MemoryFact, 'id' | 'uid' | 'createdAt'>): Promise<MemoryFact> {
    const id = generateId();
    const newFact: MemoryFact = {
      ...fact,
      id,
      uid,
      createdAt: toTimestamp(),
    };

    await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.memory)
      .doc(id)
      .set(newFact);

    return newFact;
  }

  async extractAndSaveFacts(uid: string, userMessage: string, aiResponse: string): Promise<void> {
    try {
      const extracted = await this.ai.completeJSON<{ facts: Array<{ fact: string; category: string }> }>({
        messages: [
          {
            role: 'system',
            content: `Extract key business facts about the user from this conversation exchange. 
Only extract facts that are genuinely informative about the user's business.
Respond with JSON: { "facts": [{ "fact": "Concise fact statement", "category": "product|audience|budget|goal|decision|general" }] }
If no meaningful facts, return { "facts": [] }`,
          },
          {
            role: 'user',
            content: `User said: "${userMessage}"\nAI responded: "${aiResponse.slice(0, 500)}"`,
          },
        ],
        responseFormat: 'json',
        maxTokens: 512,
        temperature: 0.3,
      });

      for (const item of extracted.facts) {
        await this.addFact(uid, {
          fact: item.fact,
          category: item.category as MemoryFact['category'],
          confidence: 0.8,
          source: 'chat',
        });
      }

      logger.debug(`Extracted ${extracted.facts.length} memory facts for ${uid}`);
    } catch (err) {
      logger.warn(`Memory extraction failed: ${(err as Error).message}`);
    }
  }

  async clearMemory(uid: string): Promise<void> {
    const snapshot = await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.memory)
      .get();

    const batch = this.db.batch();
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
