import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { MemoryService } from '../../ai/memory/memory.service';
import { DNAService } from '../../ai/dna/dna.service';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { generateId, toTimestamp } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

export interface ProductIdea {
  id: string;
  name: string;
  niche: string;
  targetCustomer: string;
  margin: string;
  competition: 'Low' | 'Medium' | 'High';
  sourcingPlatform: string;
  validationStrategy: string;
  uniqueAngle: string;
  createdAt: string;
}

const IDEA_GENERATION_PROMPT = (context: string) => `
You are an expert e-commerce co-founder. Generate 3 high-potential e-commerce product ideas for an Indian startup based on this context:
${context}

You MUST return the output as a valid JSON object matching this structure:
{
  "ideas": [
    {
      "name": "Product name (e.g. Premium Millet Health Mix)",
      "niche": "Category/niche (e.g. Organic Food)",
      "targetCustomer": "Target audience (e.g. Health-conscious urban mothers)",
      "margin": "Estimated gross margin percentage (e.g. 65%)",
      "competition": "Low",
      "sourcingPlatform": "Sourcing source (e.g. FPOs in Tamil Nadu, IndiaMART)",
      "validationStrategy": "How to validate with zero budget (e.g. 5 Instagram reels showing recipe ideas)",
      "uniqueAngle": "Differentiating factor (e.g. Traditional recipe, eco-friendly paper packaging)"
    }
  ]
}

Make sure the "competition" field is exactly one of: "Low", "Medium", or "High".
Keep all values crisp, short, and to the point. Avoid verbose descriptions. Use at most 1 short sentence or phrase for each field.
`;

export class IdeaGeneratorService {
  private ai = new OpenAIProvider();
  private memoryService = new MemoryService();
  private dnaService = new DNAService();
  private db = getFirestore();

  async generateIdeas(uid: string, prompt?: string): Promise<ProductIdea[]> {
    const [dna, memoryTiers, userSnap] = await Promise.all([
      this.dnaService.getOrCreateDNA(uid),
      this.memoryService.getMemoryTiers(uid),
      this.db.collection(collections.users).doc(uid).get(),
    ]);

    const userData = userSnap.exists ? userSnap.data() as Record<string, any> : null;
    const tier = userData?.subscription?.tier ?? 'free';

    const stageMap: Record<string, string> = {
      idea: 'Just exploring — no product chosen yet',
      validating: 'Has an idea, checking if it\'s viable',
      starting: 'Ready to start, needs execution guidance',
      growing: 'Already selling, wants to grow faster',
      scaling: 'Established, wants to scale',
    };
    const stageCtx = stageMap[dna?.businessStage ?? 'idea'] ?? 'Exploring';
    const stateCtx = dna?.state ? `from ${dna.state}` : 'in India';
    const budgetCtx = dna?.budgetLabel ? `Budget: ${dna.budgetLabel}` : '';
    const riskCtx = dna?.riskTolerance ? `Prefers ${dna.riskTolerance}-risk.` : '';
    const nicheCtx = dna?.niche ? `Focus: ${dna.niche}.` : '';
    const storyCtx = memoryTiers.longTerm?.userStory || '';
    const factsCtx = memoryTiers.working.slice(0, 8).map(f => f.fact).join(', ');

    const profileSummary = `Founder is ${stageCtx} ${stateCtx}. ${nicheCtx} ${budgetCtx} ${riskCtx} Journey: ${storyCtx}. Working details: ${factsCtx}`;

    let tierDirective = '';
    if (tier === 'enterprise') {
      tierDirective = `\n[ENTERPRISE STRATEGY DIRECTIVES]
1. Generate highly strategic, scalable product ideas (D2C brand with national/export potential, specialized B2B solutions, or SaaS tools).
2. Recommend specific Indian manufacturing or wholesale clusters (e.g. Tiruppur/Erode for knitwear/apparel, Surat for textiles, Ludhiana for woolens, Rajkot for machine parts, Agra/Kanpur for leather, Jaipur for handicrafts).
3. Suggest advanced validation strategies (e.g., pre-launch landing page with Meta Lead Ads, private beta test, influencer seed kits).
4. Margins must be highly attractive and realistic (60%+).`;
    } else if (tier === 'premium') {
      tierDirective = `\n[PREMIUM STRATEGY DIRECTIVES]
1. Generate high-margin physical or digital product ideas.
2. Suggest sourcing platforms like IndiaMART or specific regional wholesale hubs.
3. Suggest actionable zero-CAC validation strategies (e.g., landing page pre-orders, organic Instagram Reels loops, WhatsApp Catalog testing).`;
    } else {
      tierDirective = `\n[STANDARD/FREE DIRECTIVES]
1. Generate practical, straightforward e-commerce products.
2. Suggest dropshipping, reselling, or simple wholesale sourcing.
3. Suggest low-effort validation strategies (e.g. sharing with friends, community feedback surveys).`;
    }

    const context = `${profileSummary}${tierDirective}${prompt ? `\n\nAdditional user request: ${prompt}` : ''}`;

    const result = await this.ai.completeJSON<{ ideas: Omit<ProductIdea, 'id' | 'createdAt'>[] }>({
      messages: [
        {
          role: 'user',
          content: IDEA_GENERATION_PROMPT(context),
        },
      ],
      responseFormat: 'json',
      maxTokens: 1000,
      temperature: 0.8,
      uid,
      feature: 'idea-generator',
    });

    const ideas: ProductIdea[] = result.ideas.map((idea) => ({
      ...idea,
      id: generateId(),
      createdAt: toTimestamp(),
    }));

    // Update hasGeneratedFirstIdeas flag on the user document (asynchronously)
    if (userData && userData.hasGeneratedFirstIdeas !== true) {
      this.db.collection(collections.users).doc(uid).update({
        hasGeneratedFirstIdeas: true,
        updatedAt: toTimestamp(),
      }).catch((e) => logger.warn(`Failed to update hasGeneratedFirstIdeas for user ${uid}: ${e.message}`));
    }

    return ideas;
  }

  async saveIdea(uid: string, idea: ProductIdea): Promise<ProductIdea> {
    await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.ideas)
      .doc(idea.id)
      .set(idea);
    return idea;
  }

  async getSavedIdeas(uid: string): Promise<ProductIdea[]> {
    const snapshot = await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.ideas)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((d) => d.data() as ProductIdea);
  }

  async deleteIdea(uid: string, id: string): Promise<void> {
    await this.db
      .collection(collections.users)
      .doc(uid)
      .collection(collections.ideas)
      .doc(id)
      .delete();
  }
}
