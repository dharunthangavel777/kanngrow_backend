import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { MemoryService } from '../../ai/memory/memory.service';
import { DNAService } from '../../ai/dna/dna.service';
import { getFirestore, collections } from '../../core/config/firebase.config';
import { generateId, toTimestamp } from '../../core/utils/helpers';

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
`;

export class IdeaGeneratorService {
  private ai = new OpenAIProvider();
  private memoryService = new MemoryService();
  private dnaService = new DNAService();
  private db = getFirestore();

  async generateIdeas(uid: string, prompt?: string): Promise<ProductIdea[]> {
    const [dna, memoryTiers] = await Promise.all([
      this.dnaService.getOrCreateDNA(uid),
      this.memoryService.getMemoryTiers(uid),
    ]);

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

    const context = prompt
      ? `${profileSummary}\n\nAdditional user request: ${prompt}`
      : profileSummary;

    const result = await this.ai.completeJSON<{ ideas: Omit<ProductIdea, 'id' | 'createdAt'>[] }>({
      messages: [
        {
          role: 'user',
          content: IDEA_GENERATION_PROMPT(context),
        },
      ],
      responseFormat: 'json',
      maxTokens: 2000,
      temperature: 0.8,
      uid,
      feature: 'idea-generator',
    });

    const ideas: ProductIdea[] = result.ideas.map((idea) => ({
      ...idea,
      id: generateId(),
      createdAt: toTimestamp(),
    }));

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
