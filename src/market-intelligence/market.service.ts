import { getFirestore, collections } from '../core/config/firebase.config';
import { ProfileService } from '../modules/profile/profile.service';
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

interface MarketReport {
  id: string;
  title: string;
  category: string;
  type: string;
  summary: string;
  opportunityScore: number;
  isActive: boolean;
  createdAt: string;
}

const STATIC_REPORTS: MarketReport[] = [
  {
    id: 'rep_textile_sourcing',
    title: 'Tiruppur Cotton Surplus',
    category: 'textiles',
    type: 'Sourcing',
    summary: 'Cotton yarn prices in Tiruppur have dropped by 8% due to summer surplus. Excellent time to negotiate sample orders.',
    opportunityScore: 85,
    isActive: true,
    createdAt: '2026-06-01T12:00:00Z',
  },
  {
    id: 'rep_textile_demand',
    title: 'Summer Cotton Kurti Demand',
    category: 'textiles',
    type: 'Trending',
    summary: 'Search volume for breathable summer cotton kurtis is up 42% on Meesho and Amazon.in. Ideal for low-cost launch.',
    opportunityScore: 90,
    isActive: true,
    createdAt: '2026-06-02T12:00:00Z',
  },
  {
    id: 'rep_organic_snacks',
    title: 'Millet-Based Snacks Surge',
    category: 'organic food',
    type: 'Trending',
    summary: 'Post-budget push for native millets has created a 35% spike in organic snacks category queries on Amazon.',
    opportunityScore: 88,
    isActive: true,
    createdAt: '2026-06-03T12:00:00Z',
  },
  {
    id: 'rep_organic_compliance',
    title: 'FSSAI Registration Ease',
    category: 'organic food',
    type: 'Policy',
    summary: 'FSSAI basic registration fee remains ₹100/yr for startups. Instant online processing via FoSCoS portal.',
    opportunityScore: 80,
    isActive: true,
    createdAt: '2026-06-04T12:00:00Z',
  },
  {
    id: 'rep_handicrafts_etsy',
    title: 'Etsy India Seller Promotion',
    category: 'handicrafts',
    type: 'Trending',
    summary: 'Etsy is waiving listing fees for new Indian handicraft sellers exporting to the US/Europe. High dollar-margin potential.',
    opportunityScore: 92,
    isActive: true,
    createdAt: '2026-06-05T12:00:00Z',
  },
  {
    id: 'rep_handicrafts_sourcing',
    title: 'GI-Tag Brassware Sourcing',
    category: 'handicrafts',
    type: 'Sourcing',
    summary: 'Moradabad brass exporters are offering low MOQs (from 20 pieces) for custom-designed wellness home decor.',
    opportunityScore: 85,
    isActive: true,
    createdAt: '2026-06-06T12:00:00Z',
  },
  {
    id: 'rep_elec_charging',
    title: 'Wireless Charger Customization',
    category: 'electronics',
    type: 'Trending',
    summary: 'Fast-charging power banks and custom wireless chargers are dominating tech accessories search charts under ₹999.',
    opportunityScore: 87,
    isActive: true,
    createdAt: '2026-06-07T12:00:00Z',
  },
  {
    id: 'rep_beauty_hair',
    title: 'Ayurvedic Hair Oils D2C',
    category: 'beauty',
    type: 'Trending',
    summary: 'Rosemary-infused ayurvedic hair oils have experienced a 110% search growth on Instagram and Nykaa this quarter.',
    opportunityScore: 94,
    isActive: true,
    createdAt: '2026-06-08T12:00:00Z',
  },
  {
    id: 'rep_wellness_tea',
    title: 'Herbal Teas & Infusions',
    category: 'wellness',
    type: 'Trending',
    summary: 'Sleep-aid and stress-relief herbal tea blends have a 25% repeat customer rate. Perfect for premium packaging play.',
    opportunityScore: 86,
    isActive: true,
    createdAt: '2026-06-08T10:00:00Z',
  },
  {
    id: 'rep_tech_resell',
    title: 'SaaS reseller commissions',
    category: 'tech/saas',
    type: 'Trending',
    summary: 'Digital tool reselling (CRM/billing tools) is showing high demand from small retail shops shifting online.',
    opportunityScore: 82,
    isActive: true,
    createdAt: '2026-06-08T09:00:00Z',
  },
  {
    id: 'rep_jewel_silver',
    title: 'Oxidized Silver Jewellery',
    category: 'jewellery',
    type: 'Trending',
    summary: 'High-quality oxidized silver jewellery remains the highest gross margin item (70%+) with lightweight shipping under ₹40.',
    opportunityScore: 91,
    isActive: true,
    createdAt: '2026-06-08T08:00:00Z',
  },
  {
    id: 'rep_export_iec',
    title: 'IEC Exporter Code Ease',
    category: 'exports',
    type: 'Policy',
    summary: 'DGFT has simplified the IEC registration. Start exporting Indian goods with just a PAN card and current bank account.',
    opportunityScore: 84,
    isActive: true,
    createdAt: '2026-06-08T07:00:00Z',
  },
  {
    id: 'rep_drop_roposo',
    title: 'Roposo Clout Sourcing',
    category: 'dropshipping',
    type: 'Sourcing',
    summary: 'Domestic dropshipping agents in India are now offering 48-hour delivery SLA with COD verification support.',
    opportunityScore: 83,
    isActive: true,
    createdAt: '2026-06-08T06:00:00Z',
  },
  {
    id: 'rep_general_ondc',
    title: 'ONDC Merchant Integration',
    category: 'general',
    type: 'Policy',
    summary: 'ONDC network is offering zero-commission onboarding for new direct-to-consumer (D2C) sellers in selected states.',
    opportunityScore: 89,
    isActive: true,
    createdAt: '2026-06-08T05:00:00Z',
  },
];

export class MarketIntelligenceService {
  private db = getFirestore();
  private profileService = new ProfileService();

  async getOpportunityAlerts(uid: string): Promise<OpportunityAlert[]> {
    try {
      const profile = await this.profileService.getProfile(uid);
      if (!profile) return [];

      const industry = profile.industry || profile.productCategory;
      logger.info(`🔔 Fetching market alerts for industry: ${industry} (user: ${uid})`);

      // 1. Filter matching static reports
      const matchedReports = STATIC_REPORTS.filter((report) => {
        if (!industry) return true; // Show all if no industry set
        return report.category.toLowerCase().includes(industry.toLowerCase()) ||
               industry.toLowerCase().includes(report.category.toLowerCase());
      });

      const staticAlerts: OpportunityAlert[] = matchedReports.map((report) => ({
        id: report.id,
        title: report.title,
        category: report.category,
        type: report.type,
        message: `${report.type} Alert: ${report.summary}`,
        score: report.opportunityScore,
        createdAt: report.createdAt,
      }));

      // 2. Fetch admin platform context pins and map as platform alerts
      let pinsAlerts: OpportunityAlert[] = [];
      try {
        const pinsSnapshot = await this.db
          .collection(collections.platform_context)
          .where('isActive', '==', true)
          .get();

        pinsAlerts = pinsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: data.id || doc.id,
            title: 'Platform Alert',
            category: 'General',
            type: 'Platform',
            message: data.text || '',
            score: 95, // High priority score for pins
            createdAt: data.createdAt || new Date().toISOString(),
          };
        });
      } catch (err) {
        logger.warn(`Failed to fetch platform pins for alerts: ${(err as Error).message}`);
      }

      // Combine and sort by score desc, then by createdAt desc
      const allAlerts = [...pinsAlerts, ...staticAlerts];
      allAlerts.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      logger.info(`✅ Found ${allAlerts.length} matching alerts for user: ${uid}`);
      return allAlerts;
    } catch (error) {
      logger.error(`MarketIntelligenceService.getOpportunityAlerts error: ${(error as Error).message}`);
      return [];
    }
  }
}
