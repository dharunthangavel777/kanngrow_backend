import { getFirestore, collections } from '../core/config/firebase.config';
import { OpenAIProvider } from '../ai/providers/openai.provider';
import { logger } from '../core/config/logger.config';
import { generateId, toTimestamp } from '../core/utils/helpers';
import { BusinessIdea, Vendor, GovtScheme, MarketReport } from './knowledge.types';

export interface SyncResult {
  ideasCount: number;
  vendorsCount: number;
  schemesCount: number;
  reportsCount: number;
}

export class KnowledgeSync {
  private ai = new OpenAIProvider();
  private db = getFirestore();

  public async syncWebsiteDocs(url: string, adminUid: string): Promise<SyncResult> {
    try {
      logger.info(`Starting website sync for URL: ${url}`);

      // 1. Fetch the HTML using native global fetch
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL ${url}: Status ${response.status}`);
      }
      const rawHtml = await response.text();

      // 2. Clean the HTML (strip scripts, styles, and tags to minimize token footprint)
      const cleanText = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      logger.info(`Cleaned documentation payload size: ${cleanText.length} chars.`);

      // 3. Define parsing instructions and JSON output schemas
      const systemPrompt = `You are a database parser. Parse the provided e-commerce documentation into structured JSON data.
You MUST output JSON matching this schema exactly:
{
  "ideas": Array of Business Ideas,
  "vendors": Array of Vendors,
  "govtSchemes": Array of Government Schemes,
  "marketReports": Array of Market Reports
}

Schema Specifications:
1. Ideas:
   - name: string
   - category: string (e.g. reseller, export, handicraft, agri, textiles, tech)
   - description: string
   - investmentMin: number
   - investmentMax: number
   - profitMarginMin: number (percentage)
   - profitMarginMax: number (percentage)
   - marketSize: string (e.g. "₹500 Cr" or "Large")
   - demandLevel: "Low" | "Medium" | "High" | "Very High"
   - competitionLevel: "Low" | "Medium" | "High"
   - riskLevel: "Low" | "Medium" | "High"
   - targetStates: array of strings (e.g. ["Tamil Nadu"])
   - targetAudience: string
   - sourcingOptions: array of strings
   - requiredDocuments: array of strings
   - keySuccessFactors: array of strings
   - challenges: array of strings
   - growthPotential: string
   - kangrowScore: number (0-100)
   - tags: array of strings

2. Vendors:
   - name: string
   - category: string
   - type: "Online" | "Offline" | "Both"
   - description: string
   - location: string (City or state or Pan India)
   - website: string (email or website URL if present)
   - minOrderValue: number
   - deliveryDays: string (e.g. "3-7 days")
   - paymentTerms: string
   - specialties: array of strings
   - rating: number (1-5)
   - verifiedByKangrow: boolean
   - tags: array of strings

3. GovtSchemes:
   - name: string
   - fullName: string
   - department: string
   - description: string
   - eligibility: array of strings
   - benefits: array of strings
   - maxBenefitAmount: number
   - applicationProcess: string
   - applicationUrl: string
   - targetCategories: array of strings
   - targetStates: array of strings
   - documentRequired: array of strings

4. MarketReports:
   - title: string
   - category: string
   - type: "Trending" | "Seasonal" | "Emerging"
   - summary: string
   - insights: array of strings
   - opportunityScore: number (0-100)
   - relevantStates: array of strings
   - targetAudience: array of strings
   - investmentRange: string
   - source: string
   - validFrom: string (YYYY-MM-DD)

Make sure to map all elements labeled with [BUSINESS_IDEA], [VENDOR], [GOVT_SCHEME], and [MARKET_REPORT] found in the text.`;

      // 4. Call OpenAI completion
      const parsedData = await this.ai.completeJSON<{
        ideas?: any[];
        vendors?: any[];
        govtSchemes?: any[];
        marketReports?: any[];
      }>({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: cleanText }
        ],
        uid: adminUid,
        feature: 'website-sync',
        model: 'gpt-4o' // use robust model for parsing accuracy
      });

      // 5. Ingest into Firestore via Batch
      const batch = this.db.batch();
      const now = toTimestamp();
      
      const slugify = (text: string): string => {
        return text
          .toString()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
      };

      let ideasCount = 0;
      let vendorsCount = 0;
      let schemesCount = 0;
      let reportsCount = 0;

      if (parsedData.ideas && Array.isArray(parsedData.ideas)) {
        for (const raw of parsedData.ideas) {
          const id = `idea-${slugify(raw.name)}`;
          const idea: BusinessIdea = {
            ...raw,
            id,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: adminUid
          };
          batch.set(this.db.collection(collections.knowledge_ideas).doc(id), idea);
          ideasCount++;
        }
      }

      if (parsedData.vendors && Array.isArray(parsedData.vendors)) {
        for (const raw of parsedData.vendors) {
          const id = `vendor-${slugify(raw.name)}`;
          const vendor: Vendor = {
            ...raw,
            id,
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          batch.set(this.db.collection(collections.knowledge_vendors).doc(id), vendor);
          vendorsCount++;
        }
      }

      if (parsedData.govtSchemes && Array.isArray(parsedData.govtSchemes)) {
        for (const raw of parsedData.govtSchemes) {
          const id = `scheme-${slugify(raw.name)}`;
          const scheme: GovtScheme = {
            ...raw,
            id,
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          batch.set(this.db.collection(collections.knowledge_govt_schemes).doc(id), scheme);
          schemesCount++;
        }
      }

      if (parsedData.marketReports && Array.isArray(parsedData.marketReports)) {
        for (const raw of parsedData.marketReports) {
          const id = `report-${slugify(raw.title)}`;
          const report: MarketReport = {
            ...raw,
            id,
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          batch.set(this.db.collection(collections.knowledge_market_reports).doc(id), report);
          reportsCount++;
        }
      }

      await batch.commit();
      logger.info(`Website sync completed. Synced: ${ideasCount} ideas, ${vendorsCount} vendors, ${schemesCount} schemes, ${reportsCount} reports.`);

      return { ideasCount, vendorsCount, schemesCount, reportsCount };
    } catch (error) {
      logger.error(`syncWebsiteDocs error: ${(error as Error).message}`);
      throw error;
    }
  }
}
