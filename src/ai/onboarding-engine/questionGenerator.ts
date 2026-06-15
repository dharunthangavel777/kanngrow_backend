import { OpenAIProvider } from '../providers/openai.provider';
import { buildOnboardingSystemPrompt } from '../../core/utils/promptBuilder';
import { logger } from '../../core/config/logger.config';
import { getFirestore } from '../../core/config/firebase.config';
import crypto from 'crypto';

export interface OnboardingQuestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'text' | 'single' | 'multi' | 'text_search';
  options: Array<{ title: string; desc: string }>;
  isDynamic: boolean;
  stopAfterThis?: boolean;
}

const STATIC_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 'full_name',
    title: "What's your full name?",
    subtitle: "We'll use this to personalize your co-founder experience.",
    type: 'text',
    options: [],
    isDynamic: false,
  },
  {
    id: 'city',
    title: "Which city are you based in?",
    subtitle: "Helps us tailor manufacturing hubs, shipping, and local market trends.",
    type: 'text',
    options: [],
    isDynamic: false,
  },
  {
    id: 'work_situation',
    title: "What is your current work situation?",
    subtitle: "Helps us understand your daily schedule and transition plan.",
    type: 'single',
    options: [
      { title: "Employed full-time", desc: "Limited weekly hours for side-hustle" },
      { title: "Employed part-time", desc: "Flexible schedule for starting out" },
      { title: "Student", desc: "Exploring ideas, high learning energy" },
      { title: "Full-time entrepreneur", desc: "100% focused on building this business" },
      { title: "Unemployed / Transitioning", desc: "Ready to start immediately" },
    ],
    isDynamic: false,
  },
  {
    id: 'primary_goal',
    title: "What is your primary goal for starting a business?",
    subtitle: "Let's align your startup strategy with your personal vision.",
    type: 'single',
    options: [
      { title: "Financial Independence", desc: "Build passive income streams" },
      { title: "Quit 9-to-5 Job", desc: "Build a full-time business replacement" },
      { title: "Passive Side Hustle", desc: "Earn extra monthly cash on the side" },
      { title: "Scale to Large Brand", desc: "Disrupt the market, high growth venture" },
    ],
    isDynamic: false,
  },
  {
    id: 'budget_range',
    title: "What is your budget range for starting a business?",
    subtitle: "We will recommend business models and sourcing that fit your budget.",
    type: 'single',
    options: [
      { title: "Less than ₹25,000", desc: "Low-cost models like dropshipping or digital products" },
      { title: "₹25,000 to ₹1 Lakh", desc: "Micro-retail, print-on-demand, or local sourcing" },
      { title: "₹1 Lakh to ₹5 Lakhs", desc: "Custom manufacturing, private label, inventory-based" },
      { title: "Above ₹5 Lakhs", desc: "Large scale procurement, advanced custom tooling" },
    ],
    isDynamic: false,
  },
  {
    id: 'weekly_hours',
    title: "How many hours can you dedicate to your business each week?",
    subtitle: "Helps us recommend plans that fit your availability.",
    type: 'single',
    options: [
      { title: "Less than 10 hours", desc: "Very limited time, need automated workflows" },
      { title: "10 to 20 hours", desc: "Part-time focus, regular weekly execution" },
      { title: "20 to 40 hours", desc: "Substantial focus, rapid product validation" },
      { title: "40+ hours", desc: "Full-time commitment, high-speed execution" },
    ],
    isDynamic: false,
  },
  {
    id: 'risk_appetite',
    title: "What is your risk appetite for starting a business?",
    subtitle: "We'll adjust our launch tactics based on your risk comfort level.",
    type: 'single',
    options: [
      { title: "Low", desc: "Validate ideas before spending any money" },
      { title: "Medium", desc: "Comfortable investing small capital for faster growth" },
      { title: "High", desc: "Ready to invest significant capital and scale rapidly" },
    ],
    isDynamic: false,
  },
  {
    id: 'business_type',
    title: "What type of business idea are you considering?",
    subtitle: "We'll focus our recommendations on this startup model.",
    type: 'single',
    options: [
      { title: "Product-based (E-commerce)", desc: "Physical goods, dropshipping, local retail" },
      { title: "Service-based (Agency/Consulting)", desc: "Digital services, client work, freelancing" },
      { title: "Software/Product (SaaS)", desc: "Apps, software tools, digital assets" },
      { title: "Content/Creator", desc: "Blogs, courses, affiliate marketing, brand partnerships" },
    ],
    isDynamic: false,
  },
  {
    id: 'industry_interest',
    title: "Which industry are you most interested in?",
    subtitle: "Choose the niche you are passionate about or want to disrupt.",
    type: 'single',
    options: [
      { title: "Technology & Software", desc: "Apps, SaaS, web platforms" },
      { title: "Fashion & Apparel", desc: "Clothing, footwear, designer wear" },
      { title: "Home & Living", desc: "Decor, furniture, kitchenware" },
      { title: "Food & Beverages", desc: "Organic goods, snacks, specialty tea/coffee" },
      { title: "Beauty & Personal Care", desc: "Cosmetics, skincare, organic wellness" },
      { title: "Education & Learning", desc: "E-learning, coaching, school/office supplies" },
    ],
    isDynamic: false,
  },
  {
    id: 'skills',
    title: "What skills do you possess that can help in your business?",
    subtitle: "Select your primary strengths to leverage.",
    type: 'single',
    options: [
      { title: "Technical Skills", desc: "Coding, software, web development" },
      { title: "Marketing & Sales", desc: "Social media, running ads, copy" },
      { title: "Product Design / Creative", desc: "Branding, visuals, UI/UX, product sourcing" },
      { title: "Operations & Logistics", desc: "Supply chain, management, finance" },
      { title: "None/Beginner", desc: "Ready to learn everything from scratch" },
    ],
    isDynamic: false,
  },
];

export class QuestionGenerator {
  private ai = new OpenAIProvider();

  // Maximum AI-generated questions (after static name + location = 2 static)
  private static readonly MAX_AI_QUESTIONS = 15;

  /**
   * Generates the next personalized onboarding question.
   * Uses standard profile questions first to optimize speed and caching,
   * then falls back to OpenAI for deep niche dynamic follow-up questions.
   */
  async generateNextQuestion(
    answeredQuestions: Record<string, string>,
    questionsAsked: number,
    uid = 'anonymous',
  ): Promise<OnboardingQuestion | null> {
    // 1. Resolve pending static questions
    const nextStatic = STATIC_QUESTIONS.find((sq) => {
      const titleLower = sq.title.toLowerCase().replace(/\?/g, '').trim();
      return !Object.keys(answeredQuestions || {}).some((aq) => {
        return aq.toLowerCase().replace(/\?/g, '').trim() === titleLower;
      });
    });

    if (nextStatic) {
      logger.info(`Serving static onboarding question: ${nextStatic.title}`);
      return {
        ...nextStatic,
        stopAfterThis: false,
      };
    }

    // 2. Fall back to Dynamic AI questions when static sequence is complete
    if (questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS) return null;

    // Build unique canonical sequence key from answered questions (ignoring names)
    const sequenceKey = Object.entries(answeredQuestions || {})
      .filter(([q]) => {
        const lowerQ = q.toLowerCase();
        return !lowerQ.includes('name') && !lowerQ.includes('full name');
      })
      .map(([q, a]) => `${q.trim()}:${a.trim()}`)
      .sort()
      .join('|');

    const docId = crypto.createHash('md5').update(sequenceKey).digest('hex');

    // Try to get question from database pool first
    try {
      const db = getFirestore();
      const cached = await db.collection('onboarding_questions').doc(docId).get();

      if (cached.exists) {
        const cachedData = cached.data();
        if (cachedData && cachedData.question) {
          logger.info(`Reusing onboarding question from cache for sequence: ${sequenceKey}`);
          
          const q = cachedData.question as OnboardingQuestion;
          return {
            ...q,
            stopAfterThis: q.stopAfterThis || questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS - 1,
          };
        }
      }
    } catch (err) {
      logger.warn(`Failed to lookup onboarding question cache: ${(err as Error).message}`);
    }

    // Generate new question using AI fallback
    try {
      logger.info(`Cache miss. Generating onboarding question using AI for sequence: ${sequenceKey}`);
      const result = await this.ai.completeJSON<{
        id: string;
        title: string;
        subtitle: string;
        type: 'text' | 'single' | 'multi';
        options: Array<{ title: string; desc: string }>;
        stopAfterThis: boolean;
      }>({
        messages: [
          {
            role: 'system',
            content: buildOnboardingSystemPrompt(answeredQuestions, questionsAsked),
          },
          {
            role: 'user',
            content: 'Generate the next onboarding question.',
          },
        ],
        responseFormat: 'json',
        maxTokens: 300,
        temperature: 0.7,
        uid,
        feature: 'onboarding',
        model: 'gpt-4o-mini',
      });

      if (!result || !result.title) return null;

      const newQuestion: OnboardingQuestion = {
        ...result,
        isDynamic: true,
        stopAfterThis: result.stopAfterThis || questionsAsked >= QuestionGenerator.MAX_AI_QUESTIONS - 1,
      };

      // Save to cache asynchronously so we don't block response
      const db = getFirestore();
      db.collection('onboarding_questions').doc(docId).set({
        sequenceKey,
        question: newQuestion,
        createdAt: new Date().toISOString(),
      }).catch((e) => logger.warn(`Failed to save onboarding question to cache: ${e.message}`));

      return newQuestion;
    } catch (err) {
      logger.error(`Question generation failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
