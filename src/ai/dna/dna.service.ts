import { getFirestore, collections } from '../../core/config/firebase.config';
import { logger } from '../../core/config/logger.config';
import { UserDNA, DEFAULT_DNA, LanguageCode, BusinessStage, RiskTolerance, ResponseStyle, EmotionalState } from './dna.types';
import { toTimestamp } from '../../core/utils/helpers';

// ── User DNA Service ──────────────────────────────────────────────────────────
// The DNA service silently learns about the user from every conversation.
// It never asks the user anything directly — it infers from their 
// messages.

export class DNAService {
  private db = getFirestore();

  async getDNA(uid: string): Promise<UserDNA | null> {
    try {
      const doc = await this.db.collection(collections.user_dna).doc(uid).get();
      return doc.exists ? (doc.data() as UserDNA) : null;
    } catch (err) {
      logger.warn(`DNA fetch failed for ${uid}: ${(err as Error).message}`);
      return null;
    }
  }

  async getOrCreateDNA(uid: string, userName?: string): Promise<UserDNA> {
    const existing = await this.getDNA(uid);
    if (existing) return existing;

    const now = toTimestamp();
    const dna: UserDNA = {
      ...DEFAULT_DNA,
      uid,
      name: userName,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.collection(collections.user_dna).doc(uid).set(dna);
    logger.debug(`DNA created for user ${uid}`);
    return dna;
  }

  // ── Silent DNA Update from a single message exchange ─────────────────────
  async updateFromExchange(uid: string, userMessage: string, aiReply: string): Promise<void> {
    try {
      const dna = await this.getDNA(uid);
      const updates: Partial<UserDNA> = { updatedAt: toTimestamp() };

      const detectedLang = this.inferLanguage(userMessage);
      if (detectedLang !== 'english' || !dna?.language || dna.language === 'english') {
        updates.language = detectedLang;
      }

      const location = this.extractLocation(userMessage);
      if (location.state && !dna?.state) updates.state = location.state;
      if (location.city && !dna?.city) updates.city = location.city;

      const budget = this.extractBudget(userMessage);
      if (budget && (!dna?.budget || Math.abs(budget - (dna.budget || 0)) > 10000)) {
        updates.budget = budget;
        updates.budgetLabel = this.formatBudgetLabel(budget);
      }

      const stage = this.inferBusinessStage(userMessage, dna?.businessStage);
      if (stage) updates.businessStage = stage;

      const niche = this.extractNiche(userMessage);
      if (niche && !dna?.niche) updates.niche = niche;

      const risk = this.inferRiskTolerance(userMessage);
      if (risk) updates.riskTolerance = risk;

      updates.emotionalState = this.inferEmotionalState(userMessage);
      updates.totalMessages = (dna?.totalMessages || 0) + 1;
      updates.lastActiveAt = toTimestamp();

      if (niche && dna) {
        const topics = new Set([...(dna.preferredTopics || []), niche]);
        updates.preferredTopics = Array.from(topics).slice(0, 10);
      }

      const style = this.inferResponseStyle(userMessage);
      if (style) updates.preferredResponseStyle = style;

      await this.db.collection(collections.user_dna).doc(uid).set(
        { ...dna, ...updates },
        { merge: true }
      );
    } catch (err) {
      logger.warn(`DNA update failed for ${uid}: ${(err as Error).message}`);
    }
  }

  private inferLanguage(text: string): LanguageCode {
    const hasTamil = /[\u0B80-\u0BFF]/.test(text);
    const hasHindi = /[\u0900-\u097F]/.test(text);
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
    const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
    const hasKannada = /[\u0C80-\u0CFF]/.test(text);
    const hasBengali = /[\u0980-\u09FF]/.test(text);
    const hasEnglish = /[a-zA-Z]{3,}/.test(text);

    const tanglishWords = ['la', 'da', 'bro', 'pa', 'naa', 'enna', 'epdi', 'sollu',
      'yenna', 'panna', 'iruku', 'illai', 'seri', 'machan', 'dei', 'pannalam', 'vaanga'];
    const lm = text.toLowerCase();
    const isTanglish = hasEnglish && tanglishWords.some(w =>
      lm.includes(` ${w} `) || lm.endsWith(` ${w}`) || lm.startsWith(`${w} `)
    );

    const hinglishWords = ['kya', 'kar', 'hai', 'nahi', 'aur', 'bhai', 'yaar', 'matlab',
      'theek', 'accha', 'haan', 'toh', 'abhi', 'bohot', 'thoda', 'kuch'];
    const isHinglish = hasEnglish && hinglishWords.some(w =>
      lm.includes(` ${w} `) || lm.endsWith(` ${w}`) || lm.startsWith(`${w} `)
    );

    if (hasTamil && hasEnglish) return 'tanglish';
    if (isTanglish) return 'tanglish';
    if (hasTamil) return 'tamil';
    if (hasHindi && hasEnglish) return 'hinglish';
    if (isHinglish) return 'hinglish';
    if (hasHindi) return 'hindi';
    if (hasMalayalam) return 'malayalam';
    if (hasTelugu) return 'telugu';
    if (hasKannada) return 'kannada';
    if (hasBengali) return 'bengali';
    return 'english';
  }

  private extractLocation(message: string): { state?: string; city?: string } {
    const m = message.toLowerCase();
    const stateMap: Record<string, string> = {
      'tamil nadu': 'Tamil Nadu', 'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu',
      'madurai': 'Tamil Nadu', 'tiruppur': 'Tamil Nadu', 'salem': 'Tamil Nadu',
      'karnataka': 'Karnataka', 'bengaluru': 'Karnataka', 'bangalore': 'Karnataka',
      'mysuru': 'Karnataka', 'mysore': 'Karnataka',
      'maharashtra': 'Maharashtra', 'mumbai': 'Maharashtra', 'pune': 'Maharashtra',
      'nagpur': 'Maharashtra', 'nashik': 'Maharashtra',
      'gujarat': 'Gujarat', 'ahmedabad': 'Gujarat', 'surat': 'Gujarat',
      'rajasthan': 'Rajasthan', 'jaipur': 'Rajasthan',
      'delhi': 'Delhi', 'new delhi': 'Delhi',
      'uttar pradesh': 'Uttar Pradesh', 'lucknow': 'Uttar Pradesh',
      'west bengal': 'West Bengal', 'kolkata': 'West Bengal',
      'kerala': 'Kerala', 'kochi': 'Kerala', 'kozhikode': 'Kerala',
      'telangana': 'Telangana', 'hyderabad': 'Telangana',
      'andhra pradesh': 'Andhra Pradesh', 'punjab': 'Punjab', 'haryana': 'Haryana',
    };
    const cityMap: Record<string, string> = {
      'chennai': 'Chennai', 'coimbatore': 'Coimbatore', 'madurai': 'Madurai',
      'bengaluru': 'Bengaluru', 'bangalore': 'Bengaluru', 'mysuru': 'Mysuru',
      'mumbai': 'Mumbai', 'pune': 'Pune', 'ahmedabad': 'Ahmedabad',
      'jaipur': 'Jaipur', 'delhi': 'Delhi', 'hyderabad': 'Hyderabad',
      'kochi': 'Kochi', 'kolkata': 'Kolkata', 'lucknow': 'Lucknow',
    };

    let detectedState: string | undefined;
    let detectedCity: string | undefined;
    for (const [key, state] of Object.entries(stateMap)) {
      if (m.includes(key)) { detectedState = state; break; }
    }
    for (const [key, city] of Object.entries(cityMap)) {
      if (m.includes(key)) { detectedCity = city; break; }
    }
    return { state: detectedState, city: detectedCity };
  }

  private extractBudget(message: string): number | null {
    const patterns = [
      { regex: /₹\s*(\d[\d,]*)\s*(?:lakh|lac|l)/i, multiplier: 100000 },
      { regex: /(\d+(?:\.\d+)?)\s*(?:lakh|lac)\s*(?:rupees?|rs\.?)?/i, multiplier: 100000 },
      { regex: /₹\s*(\d[\d,]*)\s*k/i, multiplier: 1000 },
      { regex: /(\d+)\s*k\s*(?:rupees?|rs\.?|budget)/i, multiplier: 1000 },
      { regex: /budget.*?(\d[\d,]*)/i, multiplier: 1 },
    ];
    for (const { regex, multiplier } of patterns) {
      const match = message.match(regex);
      if (match) {
        const num = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(num) && num > 0) return Math.round(num * multiplier);
      }
    }
    return null;
  }

  private formatBudgetLabel(budget: number): string {
    if (budget >= 100000) return `₹${(budget / 100000).toFixed(1)}L`;
    if (budget >= 1000) return `₹${Math.round(budget / 1000)}K`;
    return `₹${budget}`;
  }

  private inferBusinessStage(message: string, current?: BusinessStage): BusinessStage | null {
    const m = message.toLowerCase();
    if (/already (selling|running|have|started)|my (store|shop|business) is|growing|scaling/i.test(m)) return 'growing';
    if (/just started|launched|first (order|sale)|started (selling|my)/i.test(m)) return 'starting';
    if (/planning to start|about to|ready to|how do i start/i.test(m)) return 'starting';
    if (/is (this|it) good|worth it|validate|should i (go with|pick)|viable/i.test(m)) return 'validating';
    if (/no idea|don.t know|suggest|what (should|can) i|any ideas|exploring/i.test(m)) return 'idea';
    return null;
  }

  private extractNiche(message: string): string | null {
    const m = message.toLowerCase();
    const niches: Array<[RegExp, string]> = [
      [/textile|garment|cloth|saree|apparel|fashion/, 'Textiles & Fashion'],
      [/organic|millet|spice|agri|farm|food|grocery/, 'Organic Food'],
      [/handicraft|handloom|art|craft|handmade/, 'Handicrafts'],
      [/electronics|gadget|mobile|tech|laptop|device/, 'Electronics'],
      [/beauty|skincare|cosmetic|makeup/, 'Beauty & Skincare'],
      [/health|wellness|supplement|ayurved/, 'Health & Wellness'],
      [/saas|software|it service/, 'Tech & SaaS'],
      [/jewel|gold|silver/, 'Jewellery'],
      [/export|international/, 'Exports'],
      [/dropship/, 'Dropshipping'],
    ];
    for (const [pattern, niche] of niches) {
      if (pattern.test(m)) return niche;
    }
    return null;
  }

  private inferRiskTolerance(message: string): RiskTolerance | null {
    if (/safe|low risk|no loss|secure|guaranteed/i.test(message)) return 'low';
    if (/aggressive|all in|big bet|high reward/i.test(message)) return 'high';
    if (/balanced|moderate|some risk|calculated/i.test(message)) return 'medium';
    return null;
  }

  private inferEmotionalState(message: string): EmotionalState {
    if (/confused|don.t understand|unclear|lost|not sure/i.test(message)) return 'confused';
    if (/overwhelmed|too much|complicated|complex|hard/i.test(message)) return 'overwhelmed';
    if (/excited|amazing|awesome|love it|let.s go|ready|start now|do it/i.test(message)) return 'excited';
    if (/not working|failed|didn.t (work|sell)|gave up|discouraged|no sales/i.test(message)) return 'discouraged';
    if (/let me research|tell me more|what about|how does|explain/i.test(message)) return 'researching';
    if (/let.s do|next step|how to proceed|what should i do now/i.test(message)) return 'ready';
    return 'researching';
  }

  private inferResponseStyle(message: string): ResponseStyle | null {
    if (message.split(' ').length < 8) return 'casual';
    if (message.split(' ').length > 40) return 'detailed';
    return null;
  }
}
