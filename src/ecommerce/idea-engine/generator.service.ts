import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { ContextBuilder } from '../../ai/context/contextBuilder';
import { ProfileService } from '../../modules/profile/profile.service';
import { MemoryService } from '../../ai/memory/memory.service';
import { IDEA_GENERATION_PROMPT } from '../../ai/prompts/ecommerce.prompt';
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

export class IdeaGeneratorService {
  private ai = new OpenAIProvider();
  private profileService = new ProfileService();
  private memory = new MemoryService();
  private contextBuilder = new ContextBuilder();
  private db = getFirestore();

  async generateIdeas(uid: string, prompt?: string): Promise<ProductIdea[]> {
    const [profile, facts] = await Promise.all([
      this.profileService.getProfile(uid),
      this.memory.getMemoryFacts(uid),
    ]);

    const { profileSummary } = this.contextBuilder.build(profile, facts);
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
