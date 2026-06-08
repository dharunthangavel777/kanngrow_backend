// ── Kangrow Business Intelligence Layer (Lightweight) ─────────────────────────
// Curated, factual expertise blocks injected per intent. NOT a database.
// Short, accurate, non-hallucinated. Admin can add platform context pins.

import { getFirestore, collections } from '../../core/config/firebase.config';
import { logger } from '../../core/config/logger.config';

export type BusinessIntent =
  | 'idea_discovery' | 'validation' | 'supplier_search' | 'competitor'
  | 'financial' | 'planning' | 'growth' | 'legal_compliance' | 'conversation';

// ── Fast Intent Classifier (0ms, keyword-based) ───────────────────────────────
export function classifyIntent(message: string): { intent: BusinessIntent; niche: string | null } {
  const m = message.toLowerCase();
  const niche = extractNicheKeyword(m);

  if (/supplier|vendor|source|wholesale|where to (get|buy|find)|manufacturer/i.test(m))  return { intent: 'supplier_search', niche };
  if (/validate|is (this|it) (good|viable|worth)|should i (sell|start|go with)|market (fit|demand)/i.test(m)) return { intent: 'validation', niche };
  if (/competitor|who (else|is) selling|competition|market leader/i.test(m))              return { intent: 'competitor', niche };
  if (/profit|margin|how much (can|will) i (earn|make)|revenue|roi|return/i.test(m))      return { intent: 'financial', niche };
  if (/plan|roadmap|steps|how to start|guide me|what do i (do|need)|checklist/i.test(m))  return { intent: 'planning', niche };
  if (/grow|scale|more (sales|customers|orders)|marketing|promote|ads/i.test(m))          return { intent: 'growth', niche };
  if (/gst|fssai|registration|licence|legal|permit|udyam|msme|compliance/i.test(m))       return { intent: 'legal_compliance', niche };
  if (/idea|suggest|what (should|can) i sell|niche|product|business (idea|start)/i.test(m)) return { intent: 'idea_discovery', niche };
  return { intent: 'conversation', niche };
}

function extractNicheKeyword(m: string): string | null {
  const pairs: Array<[RegExp, string]> = [
    [/textile|garment|cloth|saree|fashion|apparel/, 'textiles'],
    [/organic|millet|spice|agri|food|grocery/, 'organic food'],
    [/handicraft|handloom|craft|handmade/, 'handicrafts'],
    [/electronics|gadget|mobile|device/, 'electronics'],
    [/beauty|skincare|cosmetic/, 'beauty'],
    [/health|wellness|ayurved|supplement/, 'wellness'],
    [/saas|software|tech service/, 'tech/saas'],
    [/jewel|gold|silver/, 'jewellery'],
    [/export|international/, 'exports'],
    [/dropship/, 'dropshipping'],
  ];
  for (const [r, n] of pairs) if (r.test(m)) return n;
  return null;
}

// ── Curated Intelligence Blocks ───────────────────────────────────────────────
const BLOCKS: Record<BusinessIntent, string> = {
  idea_discovery: `KANGROW BUSINESS INTELLIGENCE:
Top ecommerce niches for Indian founders (2025):
• Textiles & Fashion: Tiruppur knitwear, Surat fabrics, Jaipur prints — marketplace margins 35–55%
• Organic Food: Native millets, cold-pressed oils, heritage spices — 60–70% repeat rate, growing 22% YoY
• Handicrafts Export: GI-tagged Bidriware, Channapatna toys, Chettinad brass — $40–$200 AOV on Etsy/Amazon Handmade
• B2B SaaS Reselling: Zoho, Tally, Google Workspace — 15–30% recurring commission, zero inventory
• Beauty & Skincare: Low MOQ, high margins, Instagram-D2C model
• Sports & Fitness: 25% YoY growth in India, Amazon-dominant
Scoring: Demand × Margin × Low-Competition × Execution Simplicity = Best opportunity`,

  validation: `KANGROW VALIDATION FRAMEWORK (7 days, zero spend):
1. Google Trends India → check 12-month trajectory (rising = good signal)
2. Amazon.in → search product → check Best Sellers Rank (BSR <10,000 = strong demand)
3. Meesho/Flipkart → count sellers, read 1–2 star reviews = your gap
4. IndiaMART → supplier quotes = your real COGS
5. Instagram Reels → search hashtag, view counts on product videos
Green flags: Rising trend + painful reviews + BSR <5,000 + margin headroom
Red flags: Saturated sellers + commodity pricing + seasonal only`,

  supplier_search: `KANGROW SOURCING INTELLIGENCE:
India's best sourcing hubs:
• Textiles: Tiruppur (knitwear), Surat (fabrics/sarees), Jaipur (block prints), Ludhiana (woollens)
• Handicrafts: Moradabad (brass), Jaipur (gems/jewelry), Jodhpur (furniture), Channapatna (toys)
• Electronics: Nehru Place Delhi, SP Road Bengaluru, Lamington Road Mumbai
• Organic Food: FPOs (Farmer Producer Orgs) in TN, Karnataka, UP — farm-direct pricing
• Leather goods: Kanpur, Chennai Ambattur, Kolkata
Online: IndiaMART, TradeIndia, JustDial verified listings
MOQ tip: Most suppliers accept ₹2,000–₹5,000 sample orders. Always sample before bulk.`,

  competitor: `KANGROW COMPETITOR ANALYSIS:
Fast competitive intelligence:
1. Amazon.in → Best Sellers in category → Top 10 = your real competition
2. 1–3 star reviews → product gaps = your differentiation opportunity  
3. Price cluster: where does 70% of listings sit? → position just below
4. Seller profile: how long selling, rating, review velocity
5. SimilarWeb free tier → check D2C competitors' traffic sources
India-specific: Meesho sellers compete on price only — win via branding + quality story
D2C differentiation: storytelling + artisan/farm origin + packaging = moat`,

  financial: `KANGROW UNIT ECONOMICS:
Quick profitability model:
Net Margin = Selling Price − COGS − Platform Fee − Shipping − Returns
Platform fees: Amazon 8–15% | Flipkart 10–15% | Meesho 15–22% | Own site 2–4%
Shipping: ₹40–₹80 per order (Shiprocket/Delhivery)
Returns provision: 5–8% for apparel, 2–3% for food
Healthy targets: Gross Margin >40% | CAC payback <3 months | Repeat Rate >25%
Break-even = Fixed Monthly Cost ÷ Net Margin per Order
Common mistake: Forgetting returns + shipping + fees. Always model worst case.`,

  planning: `KANGROW 90-DAY LAUNCH PLAYBOOK:
Days 1–14 (Foundation): Udyam MSME → current account → source 5 SKU samples → seller account
Days 15–30 (Listings): 7 product photos per SKU → keyword-rich title → competitive pricing → list
Days 31–60 (First Revenue): ₹500–₹1,000 Sponsored Products Ads at 30% ACoS → get 10+ reviews → find best seller
Days 61–90 (Scale): Double inventory on winning SKU → 2nd channel (Flipkart or D2C site) → analyze unit economics
Critical rule: Start with 5 products max. One strong product beats 50 weak ones.`,

  growth: `KANGROW GROWTH PLAYBOOK:
By revenue stage:
₹0 → ₹1L/month: Meesho organic + Amazon listings + WhatsApp catalogue (free, highest ROI)
₹1L → ₹10L/month: Amazon SP Ads (15–20% ACoS) + Instagram Reels (product demos, 3×/week) + email/WhatsApp retention
₹10L+/month: Google Shopping Ads + Facebook Lookalike Audiences + micro-influencers (10K–50K followers)
India's secret weapon: WhatsApp broadcast lists = ₹0 CAC, 60%+ open rate
Retention hack: Post-purchase WhatsApp at day 25–30 for consumables = 35%+ reorder rate`,

  legal_compliance: `KANGROW COMPLIANCE CHECKLIST:
Mandatory for all sellers:
✓ Udyam MSME Registration — udyamregistration.gov.in (free, 10 min)
✓ GST Registration — if turnover >₹40L or interstate supply (mandatory for all marketplaces)
✓ Current Account — required for all marketplace payouts
✓ PAN linked to business

Category add-ons:
• Food/beverages: FSSAI Basic Licence (turnover <₹12L) — foscos.fssai.gov.in
• Export: IEC from DGFT.gov.in (₹500, 2 days processing)
• Electronics: BIS certification if applicable

Govt schemes to claim: PM Vishwakarma (artisans/handloom), PMEGP (manufacturing), SIDBI loans (collateral-free up to ₹10L)`,

  conversation: `KANGROW EXPERTISE:
You are an expert in Indian ecommerce: marketplace selling (Amazon, Flipkart, Meesho), D2C brands, product sourcing, export, GST/FSSAI compliance, financial modelling, and growth marketing.
Always ground answers in Indian market reality — ₹ budgets, Indian suppliers, Indian platforms.`,
};

export function getBusinessIntelligence(intent: BusinessIntent): string {
  return BLOCKS[intent] ?? BLOCKS.conversation;
}

// ── Admin Platform Context Pins ───────────────────────────────────────────────
let _cachedPins: string[] = [];
let _pinsCachedAt = 0;
const PINS_TTL = 10 * 60 * 1000;

export async function getPlatformPins(): Promise<string> {
  const now = Date.now();
  if (_cachedPins.length > 0 && now - _pinsCachedAt < PINS_TTL) {
    return _cachedPins.join('\n');
  }
  try {
    const db = getFirestore();
    const snap = await db.collection(collections.platform_context)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    _cachedPins = snap.docs.map((d) => `📌 ${(d.data() as { text: string }).text}`);
    _pinsCachedAt = now;
    return _cachedPins.join('\n');
  } catch (err) {
    logger.warn(`Platform pins fetch failed: ${(err as Error).message}`);
    return '';
  }
}
