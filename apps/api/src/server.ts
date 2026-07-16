import * as Sentry from '@sentry/node';
import { buildApp, createDefaultStore } from './app';
import { PrismaStore } from './prisma-store';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
}

/**
 * Validate that all required environment variables are present
 * before the server starts. Exits with a clear error in production.
 */
function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const required = ['DATABASE_URL', 'NIBRAS_ENCRYPTION_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[nibras-api] Missing required environment variables: ${missing.join(', ')}. ` +
        'Set them before starting the server.',
    );
    process.exit(1);
  }
}

async function syncBadgeCatalogOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { BADGE_CATALOG } =
    await import('./features/gamification/badges-catalog');
  const { GamificationService } =
    await import('./features/gamification/service');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const gamification = new GamificationService(getSharedPrisma());
    const count = await gamification.ensureBadgeCatalog();
    console.log(
      JSON.stringify({
        level: count >= BADGE_CATALOG.length ? 'info' : 'warn',
        msg: 'Badge catalog synced on startup',
        count,
        expected: BADGE_CATALOG.length,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Badge catalog sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function syncCpRoadmapOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { seedCpRoadmapCurriculum } = await import('./lib/cp-roadmap-seed');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const prisma = getSharedPrisma();
    const result = await seedCpRoadmapCurriculum(prisma);
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'CP Roadmap curriculum synced on startup',
        ...result,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'CP Roadmap curriculum sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function syncCurriculumOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { seedYear1Curriculum } = await import('./lib/year1-seed');
  const { seedYear2Curriculum } = await import('./lib/year2-seed');
  const { seedYear3Curriculum } = await import('./lib/year3-seed');
  const { seedYear4Curriculum } = await import('./lib/year4-seed');
  const { syncProgramCatalogLinks } =
    await import('./features/programs/sync-catalog-links');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const prisma = getSharedPrisma();
    await seedYear1Curriculum(prisma);
    await seedYear2Curriculum(prisma);
    await seedYear3Curriculum(prisma);
    await seedYear4Curriculum(prisma);
    const linkResult = await syncProgramCatalogLinks(prisma);
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'Years 1–4 curricula synced on startup',
        catalogLinks: linkResult?.linkedTrackingCourses ?? 0,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Years 1–4 curriculum sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function syncCommunityOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { seedCommunityContent } = await import('./lib/community-seed');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const prisma = getSharedPrisma();
    const result = await seedCommunityContent(prisma);
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'Community content synced on startup',
        ...result,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Community content sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function seedLocalDevCredentialsOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (process.env.NODE_ENV === 'production') return;

  const { seedLocalDevCredentials } =
    await import('./lib/local-dev-credentials');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const prisma = getSharedPrisma();
    const result = await seedLocalDevCredentials(prisma);
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'Local dev credentials synced on startup',
        ...result,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Local dev credentials sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function seedDemoShowcaseOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { shouldDemoShowcaseSeed } = await import('./lib/runtime-env');
  if (!shouldDemoShowcaseSeed()) return;

  const { seedDemoShowcaseData } = await import('./lib/demo-showcase-seed');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const prisma = getSharedPrisma();
    const result = await seedDemoShowcaseData(prisma);
    console.log(
      JSON.stringify({
        level: result.skipped ? 'warn' : 'info',
        msg: 'Demo showcase seed completed on startup',
        ...result,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Demo showcase seed failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function syncContestsOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { getSharedPrisma } = await import('./lib/prisma');
  const {
    runContestSync,
    shouldRunContestStartupSync,
  } = await import('./features/competitions/contest-sync');
  const { enqueueCompetitionsJob } = await import('./lib/competitions-queue');

  try {
    const prisma = getSharedPrisma();
    if (await shouldRunContestStartupSync(prisma)) {
      await runContestSync(prisma);
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'Contest catalog synced on startup',
        }),
      );
    }
    await enqueueCompetitionsJob({ type: 'contest-sync' });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Contest sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function syncProblemsOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { getSharedPrisma } = await import('./lib/prisma');
  const {
    runProblemSync,
    shouldRunProblemStartupSync,
  } = await import('./features/competitions/problem-sync');
  const { enqueueCompetitionsJob } = await import('./lib/competitions-queue');

  try {
    const prisma = getSharedPrisma();
    const shouldSync = await shouldRunProblemStartupSync(prisma);
    await enqueueCompetitionsJob({ type: 'problem-sync' });
    if (!shouldSync) return;

    void runProblemSync(prisma)
      .then(() => {
        console.log(
          JSON.stringify({
            level: 'info',
            msg: 'Problem catalog synced on startup',
          }),
        );
      })
      .catch((err) => {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'Problem sync failed on startup',
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Problem sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function syncRbacOnStartup(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { seedRbac } = await import('./features/rbac/seed');
  const { getSharedPrisma } = await import('./lib/prisma');
  try {
    const result = await seedRbac(getSharedPrisma());
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'RBAC synced on startup',
        ...result,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'RBAC sync failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

function runStartupSyncInBackground(): void {
  void syncRbacOnStartup();
  void syncBadgeCatalogOnStartup();
  void syncContestsOnStartup();
  void syncProblemsOnStartup();
  void (async () => {
    await syncCpRoadmapOnStartup();
    await syncCurriculumOnStartup();
    await syncCommunityOnStartup();
    await seedDemoShowcaseOnStartup();
  })();
}

async function seedStoreOnStartup(
  store: ReturnType<typeof createDefaultStore>,
): Promise<void> {
  if (!(store instanceof PrismaStore)) {
    return;
  }
  const apiBaseUrl =
    process.env.NIBRAS_API_BASE_URL?.replace(/\/$/, '') ||
    `http://127.0.0.1:${process.env.PORT || '4848'}`;
  try {
    await store.seed(apiBaseUrl);
    console.log(
      JSON.stringify({ level: 'info', msg: 'Store seed completed on startup' }),
    );
    await seedLocalDevCredentialsOnStartup();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Store seed failed on startup',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function main(): Promise<void> {
  validateEnv();
  const port = Number(process.env.PORT || '4848');
  const host = process.env.HOST || '0.0.0.0';
  const store = createDefaultStore();

  if (process.env.DATABASE_URL) {
    await syncCurriculumOnStartup();
  }

  await seedStoreOnStartup(store);
  const app = buildApp(store);
  await app.listen({ port, host });

  console.log(
    JSON.stringify({ level: 'info', msg: 'Nibras API started', host, port }),
  );
  runStartupSyncInBackground();

  const shutdown = async (signal: string) => {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: `${signal} received, shutting down`,
      }),
    );
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
