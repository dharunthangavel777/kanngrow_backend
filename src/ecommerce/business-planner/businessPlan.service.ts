import { getFirestore, collections } from '../../core/config/firebase.config';
import { OpenAIProvider } from '../../ai/providers/openai.provider';
import { generateId, toTimestamp } from '../../core/utils/helpers';
import { logger } from '../../core/config/logger.config';

const BUSINESS_PLAN_PROMPT = (profileSummary: string) => `
You are an expert e-commerce co-founder. Generate a comprehensive, professional business plan for an Indian startup based on this founder's profile:
${profileSummary}

You MUST return the output as a valid JSON object matching this structure:
{
  "title": "A compelling brand name and plan title",
  "executiveSummary": "A concise, high-impact 3-paragraph summary of the opportunity, market fit, and path to launch.",
  "marketAnalysis": {
    "sizeAndGrowth": "Analysis of the market niche size in India and growth trends",
    "targetAudience": "Specific target demographics and buyer personas"
  },
  "productSourcing": {
    "suppliers": "Where and how to source the product (e.g. Surat, Tiruppur, IndiaMART)",
    "moqAndCost": "Typical minimum order quantities and expected initial cost in Rupees"
  },
  "launchStrategy": {
    "channels": "Primary marketplaces to launch (Amazon, Meesho, own Shopify site)",
    "marketing": "Actionable zero-CAC and paid marketing strategies"
  },
  "financials": {
    "setupCost": "Estimated initial setup costs in Rupees",
    "margins": "Target gross margins and return rate provision"
  }
}
`;

const ROADMAP_PROMPT = (profileSummary: string, goal: string) => `
You are an expert e-commerce project manager. Generate a highly structured 90-day launch roadmap for an Indian startup based on this founder's profile:
${profileSummary}
Goal to achieve: ${goal}

You MUST return the output as a valid JSON object matching this structure:
{
  "milestones": [
    {
      "phase": "Days 1-30: Foundation & Compliance",
      "tasks": [
        "Register Udyam MSME and obtain GST registration",
        "Open a current bank account for business transactions",
        "Perform product sourcing research and order initial samples"
      ]
    },
    {
      "phase": "Days 31-60: Sourcing & Platform Setup",
      "tasks": [
        "Finalize wholesale supplier contracts and bulk order stock",
        "Create seller accounts on Amazon.in, Flipkart, and Meesho",
        "Shoot high-quality product images and write keyword-rich listing descriptions"
      ]
    },
    {
      "phase": "Days 61-90: Launch & Marketing",
      "tasks": [
        "Activate product listings and run initial marketplace ads",
        "Initiate local micro-influencer campaigns and post organic Instagram Reels",
        "Monitor sales metrics, return rates, and optimize advertising spend"
      ]
    }
  ]
}
`;

export class BusinessPlanService {
  private ai = new OpenAIProvider();
  private db = getFirestore();

  async generateBusinessPlan(uid: string, profileSummary: string): Promise<{ id: string; plan: any }> {
    try {
      logger.info(`📝 Generating business plan for user: ${uid}`);

      const userSnap = await this.db.collection(collections.users).doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() as Record<string, any> : null;
      const tier = userData?.subscription?.tier ?? 'free';

      let tierDirective = '';
      if (tier === 'enterprise') {
        tierDirective = `\n[ENTERPRISE BLUEPRINT DIRECTIVES]
- Provide highly detailed, corporate-grade scaling blueprints.
- Identify specific regional sourcing hubs in India relevant to their niche (e.g. Tiruppur/Erode for knitwear/apparel, Surat for synthetic textiles, Ludhiana for woolens, Agra for leather, Jaipur for handicrafts).
- Detail precise legal and tax compliance: GST registration requirements, MSME Udyam registration, FSSAI (if food/agri), trademarking advice, and opening a commercial current bank account.
- Specify clear logistics and fulfillment strategies: Shiprocket, Delhivery B2B/B2C, and Indian Cash-on-Delivery (COD) cost management.
- Detail launching marketing strategies emphasizing high-impact zero-CAC organic growth loops (Instagram Reels organic funnels, SEO, WhatsApp Business marketing automation) alongside performance marketing.`;
      } else if (tier === 'premium') {
        tierDirective = `\n[PREMIUM BLUEPRINT DIRECTIVES]
- Provide professional operational steps, detailed supplier MOQs, and clear setup costs.
- Mention basic Indian compliance setups: GST registration, Udyam MSME certificate, and commercial bank account setup.
- Recommend sourcing via IndiaMART or local wholesale hubs, and structured zero-CAC marketing.`;
      }

      const summaryWithTier = `${profileSummary}${tierDirective}`;

      const result = await this.ai.completeJSON<any>({
        messages: [{ role: 'user', content: BUSINESS_PLAN_PROMPT(summaryWithTier) }],
        responseFormat: 'json',
        maxTokens: 2000,
        uid,
        feature: 'business-planner',
      });

      const id = generateId();
      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.workspace)
        .doc(id)
        .set({
          id,
          type: 'business_plan',
          data: result,
          createdAt: toTimestamp(),
        });

      logger.info(`✅ Business plan saved: ${id}`);
      return { id, plan: result };
    } catch (error) {
      logger.error(`BusinessPlanService.generateBusinessPlan error: ${(error as Error).message}`);
      throw new Error(`Failed to generate business plan: ${(error as Error).message}`);
    }
  }

  async generateRoadmap(uid: string, profileSummary: string, goal: string): Promise<{ id: string; roadmap: any }> {
    try {
      logger.info(`🗺️ Generating 90-day roadmap for user: ${uid} (Goal: ${goal})`);

      const userSnap = await this.db.collection(collections.users).doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() as Record<string, any> : null;
      const tier = userData?.subscription?.tier ?? 'free';

      let tierDirective = '';
      if (tier === 'enterprise') {
        tierDirective = `\n[ENTERPRISE ROADMAP DIRECTIVES]
- Build a highly structured, corporate-grade 90-day launch plan.
- Include precise, localized legal and compliance milestones: GST registration, Udyam registration, FSSAI (for food), Current Account activation.
- Include supply chain milestones: supplier vetting in local clusters (e.g. Tiruppur, Surat), sampling, bulk negotiation.
- Include zero-CAC marketing setup milestones (Reels scheduling, WhatsApp automations) and launch performance ads.`;
      } else if (tier === 'premium') {
        tierDirective = `\n[PREMIUM ROADMAP DIRECTIVES]
- Build a structured 90-day milestone plan.
- Include basic compliance registration (GST, Udyam) and local sourcing setup (IndiaMART).
- Outline organic marketing prep and launching standard listings.`;
      }

      const summaryWithTier = `${profileSummary}${tierDirective}`;

      const result = await this.ai.completeJSON<any>({
        messages: [{ role: 'user', content: ROADMAP_PROMPT(summaryWithTier, goal) }],
        responseFormat: 'json',
        maxTokens: 2000,
        uid,
        feature: 'roadmap',
      });

      const id = generateId();
      await this.db
        .collection(collections.users)
        .doc(uid)
        .collection(collections.workspace)
        .doc(id)
        .set({
          id,
          type: 'roadmap',
          data: result,
          createdAt: toTimestamp(),
        });

      logger.info(`✅ Launch roadmap saved: ${id}`);
      return { id, roadmap: result };
    } catch (error) {
      logger.error(`BusinessPlanService.generateRoadmap error: ${(error as Error).message}`);
      throw new Error(`Failed to generate roadmap: ${(error as Error).message}`);
    }
  }
}
