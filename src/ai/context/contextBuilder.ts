import { UserDNA } from '../dna/dna.types';
import { MemoryTiers, MemoryService } from '../memory/memory.service';
import { LanguageProfile } from '../language/language.engine';
import { BusinessIntent, getBusinessIntelligence, getPlatformPins } from '../intelligence/business.context';
import { DecisionMemory } from '../decision/decision.memory';

// ── Context Builder V2 ────────────────────────────────────────────────────────
// Builds one perfect, adaptive, conversational system prompt.
// NO templates. NO mandatory sections. NO scripted formats.
// The AI talks like a smart friend who deeply knows this user.

export class ContextBuilder {
  private decisionMemory = new DecisionMemory();
  private memoryService = new MemoryService();

  async build(
    dna: UserDNA | null,
    memory: MemoryTiers,
    language: LanguageProfile,
    intent: BusinessIntent,
    uid: string,
  ): Promise<string> {
    const memoryText = this.memoryService.formatForPrompt(memory);

    const decisions = await this.decisionMemory.getDecisions(uid, 10);
    const decisionText = this.decisionMemory.formatForPrompt(decisions);

    const businessContext = getBusinessIntelligence(intent);
    const pins = await getPlatformPins();

    return this.assemble(dna, memoryText, decisionText, businessContext, pins, language);
  }

  private assemble(
    dna: UserDNA | null,
    memoryText: string,
    decisionText: string,
    businessContext: string,
    pins: string,
    language: LanguageProfile,
  ): string {
    const name = dna?.name || '';
    const greeting = name ? `(You know this user as ${name}.)` : '(First interaction — if they share their name, remember it.)';
    const stateCtx = dna?.state ? `from ${dna.state}` : 'in India';
    const budgetCtx = dna?.budgetLabel ? `Budget: ${dna.budgetLabel}` : '';
    const stageCtx = this.stageLabel(dna?.businessStage);
    const riskCtx = dna?.riskTolerance ? `Prefers ${dna.riskTolerance}-risk approaches.` : '';
    const nicheCtx = dna?.niche ? `Current focus: ${dna.niche}.` : '';

    return `You are Kangrow AI — a personal ecommerce co-founder built for Indian entrepreneurs. ${greeting}

USER PROFILE:
${name ? `Name: ${name}` : 'Name: Not yet known'}
Location: ${stateCtx}
${budgetCtx}
Stage: ${stageCtx}
${nicheCtx}
${riskCtx}
${decisionText ? `\n${decisionText}` : ''}

${memoryText ? `WHAT YOU ALREADY KNOW ABOUT THIS USER:\n${memoryText}\n` : ''}
${pins ? `CURRENT PLATFORM CONTEXT:\n${pins}\n` : ''}

YOUR ECOMMERCE EXPERTISE:
${businessContext}

${language.instruction}

HOW TO RESPOND:
${this.styleGuide(dna?.preferredResponseStyle, dna?.emotionalState)}
- Talk like a smart, direct friend who happens to be an ecommerce expert. Not a consultant.
- Give ONE clear recommendation, not a menu of options.
- Use real numbers: "₹35K startup cost", "40% margin", "Meesho takes 18%" — not vague claims.
- Never make up statistics. If uncertain, say "industry data suggests" or "typically around".
- No section headers like "SITUATION:", "RECOMMENDATION:", "OPPORTUNITY SCORING:". Never.
- No forced structure, no mandatory format — just a natural, flowing response.
- End with 2–3 short follow-up suggestions the user might want to ask, each on its own line starting with "→ "
  Example: → Want me to find suppliers for this? → Should I help you estimate the profit margin?

${this.emotionGuide(dna?.emotionalState)}`;
  }

  private stageLabel(stage?: string): string {
    return ({
      idea: 'Just exploring — no product chosen yet',
      validating: 'Has an idea, checking if it\'s viable',
      starting: 'Ready to start, needs execution guidance',
      growing: 'Already selling, wants to grow faster',
      scaling: 'Established, wants to scale',
    } as Record<string, string>)[stage ?? 'idea'] ?? 'Exploring';
  }

  private styleGuide(style?: string, emotion?: string): string {
    if (emotion === 'overwhelmed') return '- User is OVERWHELMED. Be very simple. One thing at a time. Short sentences. Skip all jargon.';
    if (emotion === 'confused') return '- User is CONFUSED. First clarify what they actually need. Ask one focused question if the intent is unclear.';
    if (emotion === 'excited') return '- User is EXCITED and ready. Match their energy. Lead with action. Skip caveats.';
    if (emotion === 'discouraged') return '- User is DISCOURAGED. Lead with a brief human acknowledgment, then immediately give 1–2 easy concrete next steps.';
    return ({
      casual: '- Keep it short and conversational. Friendly tone.',
      detailed: '- Be thorough. User likes depth and specifics.',
      story: '- Use real examples and analogies. Make it relatable.',
      analytical: '- Be data-driven. Frameworks + specific numbers.',
    } as Record<string, string>)[style ?? 'casual'] ?? '- Keep it conversational and friendly.';
  }

  private emotionGuide(emotion?: string): string {
    const map: Record<string, string> = {
      confused: 'IMPORTANT: User is confused. Start by identifying what they\'re unclear about. Ask one specific clarifying question, then answer it clearly.',
      overwhelmed: 'IMPORTANT: User is overwhelmed. Say "Let\'s focus on just one thing." Give only one next step. No lists longer than 3 items.',
      ready: 'IMPORTANT: User is ready to act. Skip background. Give immediate, specific action steps.',
      discouraged: 'IMPORTANT: User is discouraged. One sentence of empathy, then immediately pivot to 1–2 things they can do TODAY.',
    };
    return map[emotion ?? ''] ? `${map[emotion!]}` : '';
  }
}
