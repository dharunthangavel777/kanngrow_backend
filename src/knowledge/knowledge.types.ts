// ── Kangrow Knowledge Base — Type Definitions ─────────────────────────────────
// These are the proprietary knowledge entities that power Kangrow's RAG system.

export interface BusinessIdea {
  id: string;
  name: string;                         // "Textile Reseller"
  category: string;                     // "Fashion & Apparel"
  description: string;                  // 1–2 sentence overview
  investmentMin: number;                // ₹ amount
  investmentMax: number;                // ₹ amount
  profitMarginMin: number;              // % e.g. 25
  profitMarginMax: number;              // % e.g. 40
  marketSize: string;                   // "₹500 Cr" or "Large"
  demandLevel: 'Low' | 'Medium' | 'High' | 'Very High';
  competitionLevel: 'Low' | 'Medium' | 'High';
  riskLevel: 'Low' | 'Medium' | 'High';
  targetStates: string[];               // ["Tamil Nadu", "Karnataka"] — empty = all India
  targetAudience: string;
  sourcingOptions: string[];            // ["Alibaba", "Local Wholesale Market"]
  requiredDocuments: string[];          // ["GST", "MSME Registration"]
  keySuccessFactors: string[];
  challenges: string[];
  growthPotential: string;              // Free text
  kangrowScore: number;                 // 0–100 — admin-set overall opportunity score
  tags: string[];                       // for search: ["ecommerce", "low-investment"]
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;                    // admin uid
}

export interface Vendor {
  id: string;
  name: string;                         // "Alibaba"
  category: string;                     // "Electronics"
  type: 'Online' | 'Offline' | 'Both';
  description: string;
  website?: string;
  location?: string;                    // City or "Pan India" or "International"
  minOrderValue?: number;               // ₹
  deliveryDays?: string;                // "3–7 days"
  paymentTerms?: string;
  specialties: string[];
  rating: number;                       // 1–5 stars
  verifiedByKangrow: boolean;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GovtScheme {
  id: string;
  name: string;                         // "PMEGP"
  fullName: string;                     // "Prime Minister's Employment Generation Programme"
  department: string;                   // "MSME Ministry"
  description: string;
  eligibility: string[];                // list of criteria
  benefits: string[];                   // ["Up to ₹25L grant", "35% subsidy for General category"]
  maxBenefitAmount?: number;            // ₹
  applicationProcess: string;
  applicationUrl?: string;
  targetCategories: string[];           // which business categories qualify
  targetStates: string[];               // [] = pan India
  documentRequired: string[];
  validUntil?: string;                  // ISO date or "Ongoing"
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketReport {
  id: string;
  title: string;
  category: string;
  type: 'Trending' | 'Seasonal' | 'Emerging' | 'Declining';
  summary: string;
  insights: string[];
  opportunityScore: number;             // 0–100
  relevantStates: string[];
  targetAudience: string[];
  investmentRange: string;              // "₹20,000 – ₹1,00,000"
  source?: string;                      // where the data came from
  validFrom: string;                    // ISO date
  validUntil?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSearchResult {
  ideas: BusinessIdea[];
  vendors: Vendor[];
  schemes: GovtScheme[];
  marketReports: MarketReport[];
}
