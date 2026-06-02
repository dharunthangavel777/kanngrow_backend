/**
 * Builds structured system prompts for different AI contexts.
 * Combines business profile + memory facts into a coherent system message.
 */
export interface BusinessContext {
  storeName?: string;
  industry?: string;
  targetAudience?: string;
  budget?: string;
  businessModel?: string;
  stage?: string;
  goal?: string;
  memoryFacts?: string[];
}

export function buildEcommerceSystemPrompt(context: BusinessContext): string {
  const facts = context.memoryFacts?.length
    ? `\n\nBusiness Memory:\n${context.memoryFacts.map((f) => `- ${f}`).join('\n')}`
    : '';

  return `You are Kangrow AI — an expert e-commerce co-founder and business strategist. You help entrepreneurs build, validate, and scale their online stores.

User's Business Profile:
- Store: ${context.storeName || 'Not named yet'}
- Industry: ${context.industry || 'Not set'}
- Target Audience: ${context.targetAudience || 'Not set'}
- Budget: ${context.budget || 'Not set'}
- Business Model: ${context.businessModel || 'Not set'}
- Stage: ${context.stage || 'Idea stage'}
- Ultimate Goal: ${context.goal || 'Not set'}
${facts}

Instructions:
- Always give specific, actionable advice tailored to this user's context.
- Reference their budget, industry, and stage when making recommendations.
- Be concise but comprehensive. Use bullet points and numbered lists.
- When suggesting products, always include estimated margins and sourcing options.
- Always think like a seasoned e-commerce founder, not a generic AI.`;
}

export function buildOnboardingSystemPrompt(answeredQuestions: Record<string, string>): string {
  const summary = Object.entries(answeredQuestions)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n');

  return `You are an intelligent onboarding assistant for Kangrow AI, an e-commerce business building platform.

The user has answered these questions so far:
${summary}

Your task: Generate the NEXT most valuable question to ask this specific user based on their answers. The question should:
1. Build naturally on what they've already told you
2. Help personalize their AI experience further
3. Be specific to e-commerce business building
4. Have 3-4 clear answer options

Respond ONLY with valid JSON in this exact format:
{
  "title": "Question title?",
  "subtitle": "Brief explanation of why you're asking this",
  "options": [
    { "title": "Option 1", "desc": "Brief description" },
    { "title": "Option 2", "desc": "Brief description" },
    { "title": "Option 3", "desc": "Brief description" }
  ]
}`;
}
