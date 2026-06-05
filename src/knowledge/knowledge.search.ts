import { KnowledgeService } from './knowledge.service';
import { BusinessProfile } from '../modules/profile/profile.service';
import { KnowledgeSearchResult } from './knowledge.types';
import { logger } from '../core/config/logger.config';

// ── Kangrow Knowledge Search ──────────────────────────────────────────────────
// Searches the proprietary knowledge base to inject context into AI prompts.
// This is the RAG (Retrieval-Augmented Generation) layer that makes Kangrow
// responses uniquely different from generic ChatGPT answers.

export class KnowledgeSearchService {
  private knowledge = new KnowledgeService();

  /**
   * Smart search: uses profile + user message keywords to find relevant
   * knowledge base entries. Returns a formatted context string for the prompt.
   */
  async search(
    userMessage: string,
    profile: BusinessProfile | null,
  ): Promise<KnowledgeSearchResult> {
    try {
      const messageLower = userMessage.toLowerCase();

      // ── Extract search signals from message + profile ──────────────────────
      const budget = profile?.budget
        ? this.parseBudget(profile.budget)
        : this.extractBudgetFromMessage(messageLower);

      const state = profile?.state || this.extractStateFromMessage(messageLower);
      const category = profile?.industry || this.extractCategoryFromMessage(messageLower);

      logger.debug(`Knowledge search: budget=${budget}, state=${state}, category=${category}`);

      // ── Determine what to search based on user intent ──────────────────────
      const isAskingForIdea =
        messageLower.includes('suggest') ||
        messageLower.includes('idea') ||
        messageLower.includes('business') ||
        messageLower.includes('start') ||
        messageLower.includes('what can i sell') ||
        messageLower.includes('what to sell');

      const isAskingForScheme =
        messageLower.includes('scheme') ||
        messageLower.includes('loan') ||
        messageLower.includes('government') ||
        messageLower.includes('subsidy') ||
        messageLower.includes('grant') ||
        messageLower.includes('pmegp') ||
        messageLower.includes('mudra');

      const isAskingForVendor =
        messageLower.includes('vendor') ||
        messageLower.includes('supplier') ||
        messageLower.includes('source') ||
        messageLower.includes('buy wholesale') ||
        messageLower.includes('where to buy');

      // ── Run parallel searches ──────────────────────────────────────────────
      const [ideas, vendors, schemes, marketReports] = await Promise.all([
        isAskingForIdea || !isAskingForScheme
          ? this.knowledge.getIdeas({
              category: category || undefined,
              investmentMax: budget || undefined,
              state: state || undefined,
              limit: 5,
            })
          : Promise.resolve([]),
        isAskingForVendor
          ? this.knowledge.getVendors(category || undefined)
          : Promise.resolve([]),
        isAskingForScheme
          ? this.knowledge.getSchemes({ state: state || undefined, category: category || undefined })
          : Promise.resolve([]),
        this.knowledge.getMarketReports('Trending'),
      ]);

      const result: KnowledgeSearchResult = {
        ideas: ideas.slice(0, 5),
        vendors: vendors.slice(0, 3),
        schemes: schemes.slice(0, 3),
        marketReports: marketReports.slice(0, 3),
      };

      const totalFound =
        result.ideas.length +
        result.vendors.length +
        result.schemes.length +
        result.marketReports.length;

      logger.debug(`Knowledge search found ${totalFound} relevant entries`);
      return result;
    } catch (err) {
      logger.warn(`Knowledge search failed: ${(err as Error).message}`);
      return { ideas: [], vendors: [], schemes: [], marketReports: [] };
    }
  }

  /**
   * Format knowledge search results into a context string for the prompt.
   * This is what gets injected into the OpenAI system prompt.
   */
  formatAsContext(result: KnowledgeSearchResult): string {
    const sections: string[] = [];

    if (result.ideas.length > 0) {
      const ideaLines = result.ideas.map(
        (idea) =>
          `  • ${idea.name} | Category: ${idea.category} | Investment: ₹${idea.investmentMin.toLocaleString('en-IN')}–₹${idea.investmentMax.toLocaleString('en-IN')} | Margin: ${idea.profitMarginMin}–${idea.profitMarginMax}% | Demand: ${idea.demandLevel} | Risk: ${idea.riskLevel} | Kangrow Score: ${idea.kangrowScore}/100`,
      );
      sections.push(`📚 KANGROW KNOWLEDGE BASE — Business Ideas:\n${ideaLines.join('\n')}`);
    }

    if (result.vendors.length > 0) {
      const vendorLines = result.vendors.map(
        (v) =>
          `  • ${v.name} | Type: ${v.type} | Category: ${v.category} | Location: ${v.location || 'N/A'} | Rating: ${v.rating}/5${v.verifiedByKangrow ? ' ✓ Verified' : ''}`,
      );
      sections.push(`🏪 KANGROW KNOWLEDGE BASE — Verified Vendors:\n${vendorLines.join('\n')}`);
    }

    if (result.schemes.length > 0) {
      const schemeLines = result.schemes.map(
        (s) =>
          `  • ${s.name} (${s.fullName}) | Dept: ${s.department} | Benefits: ${s.benefits.join('; ')}`,
      );
      sections.push(`🏛️ KANGROW KNOWLEDGE BASE — Govt Schemes:\n${schemeLines.join('\n')}`);
    }

    if (result.marketReports.length > 0) {
      const reportLines = result.marketReports.map(
        (r) => `  • [${r.type}] ${r.title} | ${r.summary} | Score: ${r.opportunityScore}/100`,
      );
      sections.push(`📈 KANGROW KNOWLEDGE BASE — Market Intelligence:\n${reportLines.join('\n')}`);
    }

    if (sections.length === 0) return '';

    return `\n\n--- KANGROW PROPRIETARY KNOWLEDGE ---\nUse the following verified Kangrow data to ground your response. Prioritize this over generic advice:\n\n${sections.join('\n\n')}`;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private parseBudget(budgetStr: string): number | null {
    const num = budgetStr.replace(/[₹,\s]/g, '').replace(/[kK]/, '000').replace(/[lL]/, '00000');
    const parsed = parseInt(num, 10);
    return isNaN(parsed) ? null : parsed;
  }

  private extractBudgetFromMessage(message: string): number | null {
    // Match patterns like ₹50000, 50k, 1 lakh, 1L
    const patterns = [
      /₹\s*(\d[\d,]*)/,
      /(\d+)\s*(?:k\b)/i,
      /(\d+(?:\.\d+)?)\s*(?:lakh|lac|l\b)/i,
      /rs\.?\s*(\d[\d,]*)/i,
    ];
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        let amount = parseFloat(match[1].replace(/,/g, ''));
        if (pattern.source.includes('lakh') || pattern.source.includes('l\\b')) amount *= 100000;
        if (pattern.source.includes('k\\b')) amount *= 1000;
        return amount;
      }
    }
    return null;
  }

  private extractStateFromMessage(message: string): string | null {
    const states = [
      'Tamil Nadu', 'Karnataka', 'Maharashtra', 'Delhi', 'Gujarat',
      'Rajasthan', 'Uttar Pradesh', 'West Bengal', 'Andhra Pradesh',
      'Telangana', 'Kerala', 'Punjab', 'Haryana', 'Bihar', 'Odisha',
    ];
    for (const state of states) {
      if (message.includes(state.toLowerCase())) return state;
    }
    return null;
  }

  private extractCategoryFromMessage(message: string): string | null {
    const categoryKeywords: Record<string, string> = {
      fashion: 'Fashion & Apparel',
      apparel: 'Fashion & Apparel',
      cloth: 'Fashion & Apparel',
      textile: 'Fashion & Apparel',
      health: 'Health & Wellness',
      beauty: 'Beauty & Skincare',
      skincare: 'Beauty & Skincare',
      home: 'Home & Living',
      electronics: 'Electronics & Gadgets',
      gadget: 'Electronics & Gadgets',
      food: 'Food & Beverage',
      kids: 'Kids & Babies',
      baby: 'Kids & Babies',
      pet: 'Pet Products',
      sport: 'Sports & Fitness',
      fitness: 'Sports & Fitness',
    };
    for (const [keyword, category] of Object.entries(categoryKeywords)) {
      if (message.includes(keyword)) return category;
    }
    return null;
  }
}
