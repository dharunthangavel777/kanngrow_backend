import { getFirestore, collections } from '../core/config/firebase.config';
import { generateId, toTimestamp } from '../core/utils/helpers';
import { logger } from '../core/config/logger.config';
import {
  BusinessIdea,
  Vendor,
  GovtScheme,
  MarketReport,
} from './knowledge.types';

// ── Knowledge Service ─────────────────────────────────────────────────────────
// Manages all Kangrow proprietary knowledge — the core IP that powers RAG.
// All writes are admin-only. All reads are available to the AI context builder.

export class KnowledgeService {
  private db = getFirestore();

  // ── BUSINESS IDEAS ──────────────────────────────────────────────────────────

  async createIdea(data: Omit<BusinessIdea, 'id' | 'createdAt' | 'updatedAt'>, adminUid: string): Promise<BusinessIdea> {
    const id = generateId();
    const now = toTimestamp();
    const idea: BusinessIdea = {
      ...data,
      id,
      createdBy: adminUid,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection(collections.knowledge_ideas).doc(id).set(idea);
    logger.info(`📚 Knowledge idea created: ${idea.name}`);
    return idea;
  }

  async updateIdea(id: string, data: Partial<BusinessIdea>): Promise<void> {
    await this.db.collection(collections.knowledge_ideas).doc(id).update({
      ...data,
      updatedAt: toTimestamp(),
    });
  }

  async deleteIdea(id: string): Promise<void> {
    await this.db.collection(collections.knowledge_ideas).doc(id).update({
      isActive: false,
      updatedAt: toTimestamp(),
    });
  }

  async getIdeas(filters?: {
    category?: string;
    investmentMax?: number;
    state?: string;
    demandLevel?: string;
    limit?: number;
  }): Promise<BusinessIdea[]> {
    let query: FirebaseFirestore.Query = this.db
      .collection(collections.knowledge_ideas)
      .where('isActive', '==', true);

    if (filters?.category) {
      query = query.where('category', '==', filters.category);
    }
    if (filters?.demandLevel) {
      query = query.where('demandLevel', '==', filters.demandLevel);
    }

    const snapshot = await query.get();

    let ideas = snapshot.docs.map((d) => d.data() as BusinessIdea);

    // Sort in memory by kangrowScore descending
    ideas.sort((a, b) => (b.kangrowScore || 0) - (a.kangrowScore || 0));

    // Post-query filters (Firestore can't do these natively without composite indexes)
    if (filters?.investmentMax) {
      ideas = ideas.filter((idea) => idea.investmentMin <= filters.investmentMax!);
    }
    if (filters?.state) {
      ideas = ideas.filter(
        (idea) =>
          idea.targetStates.length === 0 ||
          idea.targetStates.some((s) => s.toLowerCase() === filters.state!.toLowerCase()),
      );
    }

    // Apply limit
    if (filters?.limit) {
      ideas = ideas.slice(0, filters.limit);
    }

    return ideas;
  }

  async getIdeaById(id: string): Promise<BusinessIdea | null> {
    const doc = await this.db.collection(collections.knowledge_ideas).doc(id).get();
    return doc.exists ? (doc.data() as BusinessIdea) : null;
  }

  // ── VENDORS ─────────────────────────────────────────────────────────────────

  async createVendor(data: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vendor> {
    const id = generateId();
    const now = toTimestamp();
    const vendor: Vendor = { ...data, id, isActive: true, createdAt: now, updatedAt: now };
    await this.db.collection(collections.knowledge_vendors).doc(id).set(vendor);
    logger.info(`🏪 Knowledge vendor created: ${vendor.name}`);
    return vendor;
  }

  async updateVendor(id: string, data: Partial<Vendor>): Promise<void> {
    await this.db.collection(collections.knowledge_vendors).doc(id).update({
      ...data,
      updatedAt: toTimestamp(),
    });
  }

  async deleteVendor(id: string): Promise<void> {
    await this.db.collection(collections.knowledge_vendors).doc(id).update({ isActive: false });
  }

  async getVendors(category?: string): Promise<Vendor[]> {
    let query: FirebaseFirestore.Query = this.db
      .collection(collections.knowledge_vendors)
      .where('isActive', '==', true);

    if (category) query = query.where('category', '==', category);

    const snapshot = await query.get();
    const vendors = snapshot.docs.map((d) => d.data() as Vendor);
    
    // Sort in memory by rating descending
    vendors.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    return vendors;
  }

  // ── GOVT SCHEMES ────────────────────────────────────────────────────────────

  async createScheme(data: Omit<GovtScheme, 'id' | 'createdAt' | 'updatedAt'>): Promise<GovtScheme> {
    const id = generateId();
    const now = toTimestamp();
    const scheme: GovtScheme = { ...data, id, isActive: true, createdAt: now, updatedAt: now };
    await this.db.collection(collections.knowledge_govt_schemes).doc(id).set(scheme);
    logger.info(`🏛️ Knowledge scheme created: ${scheme.name}`);
    return scheme;
  }

  async updateScheme(id: string, data: Partial<GovtScheme>): Promise<void> {
    await this.db.collection(collections.knowledge_govt_schemes).doc(id).update({
      ...data,
      updatedAt: toTimestamp(),
    });
  }

  async deleteScheme(id: string): Promise<void> {
    await this.db.collection(collections.knowledge_govt_schemes).doc(id).update({ isActive: false });
  }

  async getSchemes(filters?: { state?: string; category?: string }): Promise<GovtScheme[]> {
    const snapshot = await this.db
      .collection(collections.knowledge_govt_schemes)
      .where('isActive', '==', true)
      .limit(50)
      .get();

    let schemes = snapshot.docs.map((d) => d.data() as GovtScheme);

    if (filters?.state) {
      schemes = schemes.filter(
        (s) =>
          s.targetStates.length === 0 ||
          s.targetStates.some((st) => st.toLowerCase() === filters.state!.toLowerCase()),
      );
    }
    if (filters?.category) {
      schemes = schemes.filter((s) =>
        s.targetCategories.some((c) => c.toLowerCase().includes(filters.category!.toLowerCase())),
      );
    }

    return schemes;
  }

  // ── MARKET REPORTS ──────────────────────────────────────────────────────────

  async createMarketReport(data: Omit<MarketReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<MarketReport> {
    const id = generateId();
    const now = toTimestamp();
    const report: MarketReport = { ...data, id, isActive: true, createdAt: now, updatedAt: now };
    await this.db.collection(collections.knowledge_market_reports).doc(id).set(report);
    logger.info(`📈 Market report created: ${report.title}`);
    return report;
  }

  async updateMarketReport(id: string, data: Partial<MarketReport>): Promise<void> {
    await this.db.collection(collections.knowledge_market_reports).doc(id).update({
      ...data,
      updatedAt: toTimestamp(),
    });
  }

  async deleteMarketReport(id: string): Promise<void> {
    await this.db.collection(collections.knowledge_market_reports).doc(id).update({ isActive: false });
  }

  async getMarketReports(type?: MarketReport['type']): Promise<MarketReport[]> {
    let query: FirebaseFirestore.Query = this.db
      .collection(collections.knowledge_market_reports)
      .where('isActive', '==', true);

    if (type) query = query.where('type', '==', type);

    const snapshot = await query.get();
    const reports = snapshot.docs.map((d) => d.data() as MarketReport);
    
    // Sort in memory by opportunityScore descending
    reports.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
    
    return reports.slice(0, 30);
  }

  // ── STATS ───────────────────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalIdeas: number;
    totalVendors: number;
    totalSchemes: number;
    totalReports: number;
  }> {
    const [ideas, vendors, schemes, reports] = await Promise.all([
      this.db.collection(collections.knowledge_ideas).where('isActive', '==', true).count().get(),
      this.db.collection(collections.knowledge_vendors).where('isActive', '==', true).count().get(),
      this.db.collection(collections.knowledge_govt_schemes).where('isActive', '==', true).count().get(),
      this.db.collection(collections.knowledge_market_reports).where('isActive', '==', true).count().get(),
    ]);

    return {
      totalIdeas: ideas.data().count,
      totalVendors: vendors.data().count,
      totalSchemes: schemes.data().count,
      totalReports: reports.data().count,
    };
  }
}
