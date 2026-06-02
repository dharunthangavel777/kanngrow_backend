import { BusinessProfile } from '../../modules/profile/profile.service';
import { MemoryFact } from '../memory/memory.service';

export interface AIContext {
  systemPrompt: string;
  profileSummary: string;
}

export class ContextBuilder {
  build(profile: BusinessProfile | null, facts: MemoryFact[]): AIContext {
    const profileSummary = this.buildProfileSummary(profile);
    const memorySummary = this.buildMemorySummary(facts);

    const systemPrompt = `You are Kangrow AI — an expert AI e-commerce co-founder. You help entrepreneurs build, validate, and scale their online stores.

${profileSummary}
${memorySummary}

Instructions:
- Always tailor your advice to this user's specific stage, budget, and context.
- Be direct and founder-level smart — no generic advice.
- Use clear formatting with bullet points and sections.
- Suggest specific products, platforms, and suppliers by name.
- If asked about a product, always provide: margin estimate, sourcing option, competition level.`;

    return { systemPrompt, profileSummary };
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
