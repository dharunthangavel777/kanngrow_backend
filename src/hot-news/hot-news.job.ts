import cron from 'node-cron';
import { getFirestore, collections } from '../core/config/firebase.config';
import { DNAService } from '../ai/dna/dna.service';
import { HotNewsService, HotNewsTierConfig } from './hot-news.service';
import { logger } from '../core/config/logger.config';

const dnaService      = new DNAService();
const hotNewsService  = new HotNewsService();

/** Delay helper */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Main job function ────────────────────────────────────────────────────────

async function runHotNewsJob(force: boolean = false): Promise<void> {
  const jobStart = Date.now();
  logger.info(`[HotNews Job] 🔥 Starting daily Hot News generation (force=${force})...`);

  try {
    const db = getFirestore();

    // 1. Read settings fresh — reflects any admin changes without restart
    const settings = await hotNewsService.getSettings();

    if (!settings.globalEnabled) {
      logger.info('[HotNews Job] Globally disabled — skipping run.');
      return;
    }

    const enabledTiers = settings.enabledTiers.filter(t =>
      (settings.tierSettings as Record<string, HotNewsTierConfig>)[t]?.enabled
    );

    if (enabledTiers.length === 0) {
      logger.info('[HotNews Job] No tiers enabled — skipping run.');
      return;
    }

    // 2. Query eligible users (active, onboarding complete, on an enabled tier)
    const usersSnap = await db
      .collection(collections.users)
      .where('subscription.tier', 'in', enabledTiers)
      .where('isDeleted', '!=', true)
      .limit(settings.maxUsersPerRun)
      .get();

    const users = usersSnap.docs;
    logger.info(`[HotNews Job] Found ${users.length} eligible users.`);

    let sent    = 0;
    let skipped = 0;
    let failed  = 0;

    // 3. Process each user sequentially with delay (avoids OpenAI rate limits)
    for (const userDoc of users) {
      const uid      = userDoc.id;
      const userData = userDoc.data();
      const tier     = userData?.subscription?.tier as string;

      try {
        if (!force) {
          // Skip if already sent today
          const alreadySent = await hotNewsService.hasReceivedTodayIST(uid);
          if (alreadySent) {
            skipped++;
            continue;
          }
        }

        // Get tier config
        const tierConfig = (settings.tierSettings as Record<string, HotNewsTierConfig>)[tier];
        if (!tierConfig || !tierConfig.enabled) {
          skipped++;
          continue;
        }

        // Get user DNA (profile)
        const dna = await dnaService.getOrCreateDNA(uid);

        // Generate + send
        const result = await hotNewsService.generateAndSendForUser(
          uid,
          dna,
          tier,
          tierConfig.model,
          tierConfig.itemCount,
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Rate-limiting delay between users
        await sleep(settings.delayBetweenUsersMs);

      } catch (err) {
        logger.warn(`[HotNews Job] Error processing uid=${uid}: ${(err as Error).message}`);
        failed++;
      }
    }

    const elapsedSec = ((Date.now() - jobStart) / 1000).toFixed(1);
    logger.info(
      `[HotNews Job] ✅ Complete in ${elapsedSec}s — sent=${sent} skipped=${skipped} failed=${failed}`
    );

  } catch (err) {
    logger.error(`[HotNews Job] Fatal error: ${(err as Error).message}`);
  }
}

// ── Cron schedule ────────────────────────────────────────────────────────────
// Runs daily at 01:00 UTC = 06:30 IST
// Ensure node-cron is installed: npm install node-cron @types/node-cron

let _cronTask: cron.ScheduledTask | null = null;

export function startHotNewsJob(): void {
  if (_cronTask) {
    logger.warn('[HotNews Job] Already started — ignoring duplicate start.');
    return;
  }

  _cronTask = cron.schedule('0 1 * * *', () => {
    runHotNewsJob().catch(err =>
      logger.error(`[HotNews Job] Unhandled cron error: ${(err as Error).message}`)
    );
  }, {
    timezone: 'UTC',
  });

  logger.info('[HotNews Job] 🗓️  Scheduled — runs daily at 01:00 UTC (06:30 IST)');
}

export function stopHotNewsJob(): void {
  if (_cronTask) {
    _cronTask.stop();
    _cronTask = null;
    logger.info('[HotNews Job] Stopped.');
  }
}

/** Exposed for admin manual trigger endpoint */
export { runHotNewsJob };
