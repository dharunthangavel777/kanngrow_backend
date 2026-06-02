// AI Intent Types — used by the AI Router
export const AI_INTENTS = {
  PRODUCT_DISCOVERY: 'product_discovery',
  PRODUCT_VALIDATION: 'product_validation',
  COMPETITOR_ANALYSIS: 'competitor_analysis',
  MARKET_ANALYSIS: 'market_analysis',
  BUSINESS_PLANNING: 'business_planning',
  GROWTH_COACHING: 'growth_coaching',
  GENERAL_CHAT: 'general_chat',
} as const;

export type AiIntent = (typeof AI_INTENTS)[keyof typeof AI_INTENTS];

// Kangrow Module Names — shown as badges in the Flutter UI
export const MODULES = {
  IDEA_ENGINE: 'Product Idea Generator',
  VALIDATION_ENGINE: 'Product Validation',
  COMPETITOR_ANALYSIS: 'Competitor Analysis',
  MARKET_INTELLIGENCE: 'Market Intelligence',
  BUSINESS_PLANNER: 'Business Plan Generator',
  ROADMAP_ENGINE: 'E-commerce Roadmap',
  GROWTH_COACH: 'Growth Coach',
  MEMORY_ENGINE: 'Business Memory',
  AI_ROUTER: 'AI Decision Engine',
} as const;

export type Module = (typeof MODULES)[keyof typeof MODULES];

// Business Models
export const BUSINESS_MODELS = [
  'Dropshipping',
  'Direct-to-Consumer (DTC)',
  'White Label',
  'Wholesale',
  'Digital Products',
  'Marketplace',
] as const;

// E-commerce Industries
export const INDUSTRIES = [
  'Fashion & Apparel',
  'Health & Wellness',
  'Beauty & Skincare',
  'Home & Living',
  'Electronics & Gadgets',
  'Sports & Fitness',
  'Food & Beverage',
  'Kids & Babies',
  'Pet Products',
  'Digital & Software',
] as const;
