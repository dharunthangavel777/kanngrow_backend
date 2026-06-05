import { BusinessProfile } from '../../modules/profile/profile.service';
import { MemoryFact } from '../memory/memory.service';
import { KnowledgeSearchResult } from '../../knowledge/knowledge.types';

export interface AIContext {
  systemPrompt: string;
  profileSummary: string;
  knowledgeInjected: boolean;
}

export class ContextBuilder {
  /**
   * Builds the full system prompt from:
   * 1. User's business profile
   * 2. Memory facts from past conversations
   * 3. Kangrow Knowledge Base results (RAG — Stage 2)
   */
  build(
    profile: BusinessProfile | null,
    facts: MemoryFact[],
    knowledgeContext?: string,
  ): AIContext {
    const profileSummary = this.buildProfileSummary(profile);
    const memorySummary = this.buildMemorySummary(facts);
    const knowledgeInjected = !!(knowledgeContext && knowledgeContext.trim().length > 0);

    const systemPrompt = `You are Kangrow AI — an expert AI e-commerce co-founder built specifically for Indian entrepreneurs. You help people build, validate, and scale their online stores and businesses.

${profileSummary}
${memorySummary}
${knowledgeContext || ''}

Instructions:
- Always tailor your advice to this user's specific stage, budget, and context.
- Be direct and founder-level smart — no generic advice.
- Use clear formatting with bullet points and sections.
- When suggesting ideas from the Kangrow Knowledge Base above, reference them specifically (use their exact names).
- Suggest specific products, platforms, and suppliers by name.
- If asked about a product, always provide: margin estimate, sourcing option, competition level.
- When relevant Govt Schemes are listed above, always mention them with eligibility criteria.
- Format monetary amounts in Indian format (₹ with lakhs/crores notation).
- Always give actionable next steps the user can take today.`;

    return { systemPrompt, profileSummary, knowledgeInjected };
  }

  private buildProfileSummary(profile: BusinessProfile | null): string {
    if (!profile) return 'User Profile: Not yet set up.';

    const lines = [
      `Store: ${profile.storeName || 'Not named'}`,
      `Industry: ${profile.industry || 'Not set'}`,
      `Audience: ${profile.targetAudience || 'Not set'}`,
      `Budget: ${profile.budget || 'Not set'}`,
      `Business Model: ${profile.businessModel || 'Not set'}`,
      `Stage: ${profile.stage || 'Idea stage'}`,
      `Goal: ${profile.goal || 'Not set'}`,
      `Experience: ${profile.experienceLevel || 'Not set'}`,
    ];

    return `User Business Profile:\n${lines.map((l) => `- ${l}`).join('\n')}`;
  }

  private buildMemorySummary(facts: MemoryFact[]): string {
    if (!facts.length) return '';

    const topFacts = facts.slice(0, 10).map((f) => `- ${f.fact}`).join('\n');
    return `\nBusiness Memory (from past conversations):\n${topFacts}`;
  }
}
