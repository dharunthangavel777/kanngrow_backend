import { getFirestore, collections } from '../core/config/firebase.config';
import { ProfileService } from '../modules/profile/profile.service';
import { MarketReport } from '../knowledge/knowledge.types';
import { logger } from '../core/config/logger.config';

export interface OpportunityAlert {
  id: string;
  title: string;
  category: string;
  type: string;
  message: string;
  score: number;
  createdAt: string;
}

export class MarketIntelligenceService {
  private db = getFirestore();
  private profileService = new ProfileService();

  async getOpportunityAlerts(uid: string): Promise<OpportunityAlert[]> {
    try {
      const profile = await this.profileService.getProfile(uid);
      if (!profile) return [];

      const industry = profile.industry || profile.productCategory;
      logger.info(`🔔 Fetching market alerts for industry: ${industry} (user: ${uid})`);

      // Query active market reports
      const snapshot = await this.db
        .collection(collections.knowledge_market_reports)
        .where('isActive', '==', true)
        .get();

      const reports = snapshot.docs.map((doc) => doc.data() as MarketReport);

      // Filter reports matching user's industry and format as alert
      const alerts: OpportunityAlert[] = reports
        .filter((report) => {
          if (!industry) return true; // Show all alerts if no industry is set
          return report.category.toLowerCase().includes(industry.toLowerCase()) ||
                 industry.toLowerCase().includes(report.category.toLowerCase());
        })
        .map((report) => ({
          id: report.id,
          title: report.title,
          category: report.category,
          type: report.type,
          message: `${report.type} Alert: ${report.summary}`,
          score: report.opportunityScore,
          createdAt: report.createdAt,
        }));

      logger.info(`✅ Found ${alerts.length} matching alerts for user: ${uid}`);
      return alerts;
    } catch (error) {
      logger.error(`MarketIntelligenceService.getOpportunityAlerts error: ${(error as Error).message}`);
      return [];
    }
  }
}
