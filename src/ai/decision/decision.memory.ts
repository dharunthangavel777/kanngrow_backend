import { getFirestore, collections } from '../../core/config/firebase.config';
import { generateId, toTimestamp } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

export type DecisionStatus = 'selected' | 'rejected' | 'saved' | 'exploring' | 'abandoned';

export interface Decision {
  id: string;
  uid: string;
  topic: string;
  category: string;
  status: DecisionStatus;
  reason?: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export class DecisionMemory {
  private db = getFirestore();

  async getDecisions(uid: string, limit = 20): Promise<Decision[]> {
    try {
      const snap = await this.db.collection(collections.decisions)
        .where('uid', '==', uid)
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map((d: any) => d.data() as Decision);
    } catch (err) {
      logger.warn(`Decision fetch failed: ${(err as Error).message}`);
      return [];
    }
  }

  async addDecision(uid: string, data: Omit<Decision, 'id' | 'uid' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const id = generateId();
    await this.db.collection(collections.decisions).doc(id).set({
      ...data, id, uid,
      createdAt: toTimestamp(),
      updatedAt: toTimestamp(),
    });
  }

  formatForPrompt(decisions: Decision[]): string {
    if (decisions.length === 0) return '';
    const selected   = decisions.filter((d: any) => d.status === 'selected').slice(0, 3);
    const rejected   = decisions.filter((d: any) => d.status === 'rejected').slice(0, 3);
    const exploring  = decisions.filter((d: any) => d.status === 'exploring').slice(0, 2);
    const parts: string[] = [];
    if (selected.length)  parts.push(`Selected: ${selected.map((d: any) => d.topic).join(', ')}`);
    if (rejected.length)  parts.push(`Rejected (NEVER suggest again): ${rejected.map((d: any) => d.topic).join(', ')}`);
    if (exploring.length) parts.push(`Exploring: ${exploring.map((d: any) => d.topic).join(', ')}`);
    return parts.length ? `USER DECISIONS:\n${parts.join('\n')}` : '';
  }

  async extractFromExchange(uid: string, userMessage: string, sessionId: string): Promise<void> {
    try {
      const m = userMessage.toLowerCase();
      const selectedPattern = /i('ll| will| want to| going to)? (go with|choose|pick|select|start with|try)|let'?s (do|go with|try)|yes.{0,20}(idea|plan|option)/i;
      const rejectedPattern = /i don'?t (want|like)|not interested in|skip|no thanks|not for me|avoid|bad idea/i;
      const exploringPattern = /tell me more about|what about|how does|explain|more info/i;

      if (selectedPattern.test(m)) {
        const topic = this.extractTopic(userMessage);
        if (topic) await this.addDecision(uid, { topic, category: 'business_idea', status: 'selected', sessionId });
      } else if (rejectedPattern.test(m)) {
        const topic = this.extractTopic(userMessage);
        if (topic) await this.addDecision(uid, { topic, category: 'business_idea', status: 'rejected', sessionId });
      } else if (exploringPattern.test(m)) {
        const topic = this.extractTopic(userMessage);
        if (topic) await this.addDecision(uid, { topic, category: 'business_idea', status: 'exploring', sessionId });
      }
    } catch (err) {
      logger.warn(`Decision extraction failed: ${(err as Error).message}`);
    }
  }

  private extractTopic(message: string): string | null {
    const match = message.match(/(?:go with|choose|try|start|about|interested in|explore)\s+([A-Za-z\s&]{3,40})/i);
    return match ? match[1].trim() : null;
  }
}
