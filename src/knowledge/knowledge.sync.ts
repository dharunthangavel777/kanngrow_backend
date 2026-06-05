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

      // Check if rawHtml contains script array format (like local HTML)
      if (rawHtml.includes('const ideas = [') || rawHtml.includes('ideas = [')) {
        logger.info('Found script array dataset on website. Processing with native parser...');
        return await this.parseAndSaveLocalFormat(rawHtml, adminUid);
      }

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

  private async parseAndSaveLocalFormat(htmlContent: string, adminUid: string): Promise<SyncResult> {
    const startMatch = htmlContent.indexOf('const ideas = [');
    const actualStart = startMatch !== -1 ? startMatch : htmlContent.indexOf('ideas = [');
    if (actualStart === -1) {
      throw new Error('Could not find ideas array inside the HTML content');
    }
    const endMatch = htmlContent.indexOf('];', actualStart);
    if (endMatch === -1) {
      throw new Error('Malformed JavaScript array inside the HTML content');
    }
    
    // Find the prefix string length to drop (const ideas = [ is 15 chars, ideas = [ is 9 chars)
    const prefixLen = htmlContent.substring(actualStart).startsWith('const ideas = [') ? 15 : 9;
    const arrayContent = htmlContent.substring(actualStart + prefixLen - 1, endMatch + 1);
    
    // Evaluate the javascript array safely
    const ideasArray = new Function(`return ${arrayContent}`)();
    if (!Array.isArray(ideasArray)) {
      throw new Error('Parsed content is not a valid array');
    }

    logger.info(`Natively parsing fetched HTML dataset. Found ${ideasArray.length} ideas.`);
    
    let ideasImported = 0;
    let vendorsImported = 0;
    let schemesImported = 0;
    let reportsImported = 0;

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

    const parseInvestment = (investStr: string): { min: number; max: number } => {
      const clean = investStr.replace(/₹/g, '').trim();
      const parts = clean.split(/[–-]/);
      const parsePart = (p: string) => {
        p = p.trim().toUpperCase();
        let multiplier = 1;
        if (p.endsWith('K')) {
          multiplier = 1000;
          p = p.slice(0, -1);
        } else if (p.endsWith('L')) {
          multiplier = 100000;
          p = p.slice(0, -1);
        } else if (p.endsWith('CR')) {
          multiplier = 10000000;
          p = p.slice(0, -2);
        }
        const val = parseFloat(p);
        return isNaN(val) ? 0 : Math.round(val * multiplier);
      };
      const min = parsePart(parts[0] || '0');
      const max = parts[1] ? parsePart(parts[1]) : min * 3;
      return { min: min || 20000, max: max || 100000 };
    };

    const toTimestamp = () => new Date().toISOString();
    const batch = this.db.batch();

    for (const item of ideasArray) {
      const ideaId = `idea-${slugify(item.title)}`;
      const { min: invMin, max: invMax } = parseInvestment(item.invest || '');
      
      // 1. Business Idea
      const ideaDocRef = this.db.collection(collections.knowledge_ideas).doc(ideaId);
      const businessIdea = {
        id: ideaId,
        name: item.title,
        category: item.cat || 'general',
        description: item.desc || '',
        investmentMin: invMin,
        investmentMax: invMax,
        profitMarginMin: (item.scores?.margin || 6) * 5,
        profitMarginMax: ((item.scores?.margin || 6) * 5) + 15,
        marketSize: item.marketcap || 'Large',
        demandLevel: (item.scores?.demand || 6) > 8 ? 'Very High' : ((item.scores?.demand || 6) > 6 ? 'High' : 'Medium'),
        competitionLevel: (item.scores?.risk || 5) > 7 ? 'High' : ((item.scores?.risk || 5) > 4 ? 'Medium' : 'Low'),
        riskLevel: (item.scores?.risk || 5) > 7 ? 'High' : ((item.scores?.risk || 5) > 4 ? 'Medium' : 'Low'),
        targetStates: [item.state],
        targetAudience: item.docs?.customers?.map((c: any) => `${c.k}: ${c.v}`).join(', ') || 'General Consumers',
        sourcingOptions: item.docs?.vendors?.map((v: any) => v.name) || [],
        requiredDocuments: item.docs?.documentation?.map((d: any) => d.k) || [],
        keySuccessFactors: item.docs?.innovation?.map((i: any) => `${i.k}: ${i.v}`) || [],
        challenges: item.docs?.competitors?.map((c: any) => `${c.k}: ${c.v}`) || [],
        growthPotential: item.dataSection?.content || '',
        kangrowScore: (item.scores?.opportunity || 8) * 10,
        tags: [item.cat || 'general', slugify(item.state)],
        isActive: true,
        createdAt: toTimestamp(),
        updatedAt: toTimestamp(),
        createdBy: adminUid
      };
      batch.set(ideaDocRef, businessIdea);
      ideasImported++;

      // 2. Vendors
      if (item.docs?.vendors && Array.isArray(item.docs.vendors)) {
        for (const v of item.docs.vendors) {
          const vendorId = `vendor-${slugify(v.name)}`;
          const vendorDocRef = this.db.collection(collections.knowledge_vendors).doc(vendorId);
          const vendor = {
            id: vendorId,
            name: v.name,
            category: item.cat || 'general',
            type: 'Both',
            description: v.type || '',
            location: v.address || 'Pan India',
            website: v.email ? `mailto:${v.email}` : '',
            minOrderValue: 0,
            deliveryDays: '3–7 days',
            paymentTerms: 'Cash / Bank Transfer',
            specialties: [v.type || 'General Supplier'],
            rating: 4.5,
            verifiedByKangrow: true,
            tags: [item.cat || 'general'],
            isActive: true,
            createdAt: toTimestamp(),
            updatedAt: toTimestamp()
          };
          batch.set(vendorDocRef, vendor);
          vendorsImported++;
        }
      }

      // 3. Government Schemes
      if (item.docs?.govtbenefits && Array.isArray(item.docs.govtbenefits)) {
        for (const g of item.docs.govtbenefits) {
          const schemeId = `scheme-${slugify(g.k)}`;
          const schemeDocRef = this.db.collection(collections.knowledge_govt_schemes).doc(schemeId);
          const scheme = {
            id: schemeId,
            name: g.k,
            fullName: g.k,
            department: 'Government of India / State Government',
            description: g.v || '',
            eligibility: [`Targeted at ${item.cat || 'general'} sector`, 'Registered MSME / Startup'],
            benefits: [g.v || ''],
            maxBenefitAmount: 0,
            applicationProcess: 'Apply online via central/state MSME portal',
            applicationUrl: item.udyamLink || 'https://udyamregistration.gov.in/',
            targetCategories: [item.cat || 'general'],
            targetStates: [item.state],
            documentRequired: [],
            isActive: true,
            createdAt: toTimestamp(),
            updatedAt: toTimestamp()
          };
          batch.set(schemeDocRef, scheme);
          schemesImported++;
        }
      }

      // 4. Market Reports
      if (item.dataSection) {
        const reportId = `report-${slugify(item.dataSection.title)}`;
        const reportDocRef = this.db.collection(collections.knowledge_market_reports).doc(reportId);
        const report = {
          id: reportId,
          title: item.dataSection.title,
          category: item.cat || 'general',
          type: 'Trending',
          summary: item.dataSection.content || '',
          insights: [item.dataSection.content || ''],
          opportunityScore: (item.scores?.opportunity || 8) * 10,
          relevantStates: [item.state],
          targetAudience: item.docs?.customers?.map((c: any) => c.v) || ['General Shoppers'],
          investmentRange: item.invest || 'N/A',
          source: item.sourceLinks?.[0]?.title || 'Industry Reports',
          validFrom: new Date().toISOString().slice(0, 10),
          isActive: true,
          createdAt: toTimestamp(),
          updatedAt: toTimestamp()
        };
        batch.set(reportDocRef, report);
        reportsImported++;
      }
    }

    await batch.commit();
    logger.info(`Website Ingestion (Script Array format) complete: ${ideasImported} ideas, ${vendorsImported} vendors, ${schemesImported} schemes, ${reportsImported} reports written.`);
    return {
      ideasCount: ideasImported,
      vendorsCount: vendorsImported,
      schemesCount: schemesImported,
      reportsCount: reportsImported
    };
  }
}
