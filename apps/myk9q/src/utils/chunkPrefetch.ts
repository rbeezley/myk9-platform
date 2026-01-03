/**
 * Offline Preparation Utility
 *
 * Proactively loads lazy-loaded chunks AND syncs data after login for offline availability.
 * This is critical for judges who log in at check-in (online) then walk to
 * exterior search areas (offline) before accessing class/entry pages.
 *
 * Two-phase preparation:
 * 1. Chunk prefetch - Loads JS/CSS modules into browser cache
 * 2. Data sync - Ensures IndexedDB has all show data
 *
 * The service worker precaches chunks during install, but if a user goes offline
 * before visiting a page, the chunk won't be in the browser's module cache.
 * This utility triggers the dynamic imports to ensure chunks are loaded.
 */

import { logger } from './logger';

// Track prefetch status
let prefetchPromise: Promise<void> | null = null;
let prefetchComplete = false;

export interface OfflinePreparationProgress {
  phase: 'chunks' | 'data';
  chunksLoaded: number;
  chunksTotal: number;
  dataTablesReady: number;
  dataTablesTotal: number;
  complete: boolean;
}

/**
 * Prefetch all critical page chunks for offline availability.
 * Returns a promise that resolves when all critical chunks are loaded.
 *
 * Safe to call multiple times - will only prefetch once.
 */
export async function prefetchCriticalChunks(): Promise<void> {
  // Already complete
  if (prefetchComplete) {
    logger.log('[ChunkPrefetch] ✅ Already complete, skipping');
    return;
  }

  // Already in progress
  if (prefetchPromise) {
    logger.log('[ChunkPrefetch] ⏳ Already in progress, waiting...');
    return prefetchPromise;
  }

  prefetchPromise = doPrefetch();
  return prefetchPromise;
}

async function doPrefetch(): Promise<void> {
  logger.log('[ChunkPrefetch] 🚀 Starting critical chunk prefetch...');
  const startTime = performance.now();

  // Track results for logging
  const results: { name: string; success: boolean; error?: string }[] = [];

  // Critical pages that judges need offline
  const criticalChunks = [
    // Core navigation pages
    { name: 'Home', loader: () => import('../pages/Home/Home') },
    { name: 'ClassList', loader: () => import('../pages/ClassList/ClassList') },
    { name: 'EntryList', loader: () => import('../pages/EntryList/EntryList') },
    { name: 'CombinedEntryList', loader: () => import('../pages/EntryList/CombinedEntryList') },
    { name: 'Announcements', loader: () => import('../pages/Announcements/Announcements') },
    { name: 'Settings', loader: () => import('../pages/Settings/Settings') },
    { name: 'DogDetails', loader: () => import('../pages/DogDetails/DogDetails') },

    // Scoresheets - critical for judges
    { name: 'UKCObedienceScoresheet', loader: () => import('../pages/scoresheets/UKC/UKCObedienceScoresheet') },
    { name: 'UKCRallyScoresheet', loader: () => import('../pages/scoresheets/UKC/UKCRallyScoresheet') },
    { name: 'UKCNoseworkScoresheet', loader: () => import('../pages/scoresheets/UKC/UKCNoseworkScoresheet') },
    { name: 'AKCScentWorkScoresheetRouter', loader: () => import('../pages/scoresheets/AKC/AKCScentWorkScoresheetRouter') },
    { name: 'AKCFastCatScoresheet', loader: () => import('../pages/scoresheets/AKC/AKCFastCatScoresheet') },
    { name: 'ASCAScentDetectionScoresheet', loader: () => import('../pages/scoresheets/ASCA/ASCAScentDetectionScoresheet') },

    // Supporting modules that may be dynamically imported
    { name: 'ReplicationInit', loader: () => import('../services/replication/initReplication') },
  ];

  // Prefetch in parallel with error handling for each
  await Promise.all(
    criticalChunks.map(async ({ name, loader }) => {
      try {
        await loader();
        results.push({ name, success: true });
      } catch (error) {
        // Don't fail the whole prefetch if one chunk fails
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ name, success: false, error: errorMessage });
        logger.warn(`[ChunkPrefetch] ⚠️ Failed to prefetch ${name}:`, errorMessage);
      }
    })
  );

  const elapsed = Math.round(performance.now() - startTime);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  logger.log(
    `[ChunkPrefetch] ✅ Complete in ${elapsed}ms: ${successCount} loaded, ${failCount} failed`
  );

  if (failCount > 0) {
    const failed = results.filter(r => !r.success).map(r => r.name);
    logger.warn('[ChunkPrefetch] Failed chunks:', failed.join(', '));
  }

  prefetchComplete = true;
}

/**
 * Reset prefetch state (call on logout to allow re-prefetch on next login)
 */
export function resetPrefetchState(): void {
  prefetchPromise = null;
  prefetchComplete = false;
  logger.log('[ChunkPrefetch] State reset');
}

/**
 * Check if prefetch has completed
 */
export function isPrefetchComplete(): boolean {
  return prefetchComplete;
}

/**
 * Check if offline preparation was recently completed (within last 30 minutes).
 * Used to skip the preparation overlay on subsequent logins.
 */
export function wasRecentlyPrepared(licenseKey: string): boolean {
  try {
    const key = `offline-prep-${licenseKey}`;
    const stored = localStorage.getItem(key);
    if (!stored) return false;

    const timestamp = parseInt(stored, 10);
    const thirtyMinutes = 30 * 60 * 1000;
    return Date.now() - timestamp < thirtyMinutes;
  } catch {
    return false;
  }
}

/**
 * Mark offline preparation as complete for a license key.
 */
function markPrepared(licenseKey: string): void {
  try {
    const key = `offline-prep-${licenseKey}`;
    localStorage.setItem(key, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Comprehensive offline preparation - loads chunks AND waits for data sync.
 * Call this after login to ensure the app is fully ready for offline use.
 *
 * @param licenseKey - License key for data sync
 * @param onProgress - Optional progress callback
 * @param timeoutMs - Maximum time to wait (default 30 seconds)
 * @returns Promise that resolves when ready or times out
 */
export async function prepareForOffline(
  licenseKey: string,
  onProgress?: (progress: OfflinePreparationProgress) => void,
  timeoutMs: number = 30000
): Promise<{ success: boolean; chunksLoaded: number; dataSynced: boolean }> {
  const startTime = performance.now();
  logger.log('[OfflinePrep] 🚀 Starting comprehensive offline preparation...');

  let chunksLoaded = 0;
  let dataSynced = false;

  const reportProgress = (phase: 'chunks' | 'data', chunksCount: number, dataReady: number, dataTotal: number) => {
    onProgress?.({
      phase,
      chunksLoaded: chunksCount,
      chunksTotal: 13, // Known chunk count
      dataTablesReady: dataReady,
      dataTablesTotal: dataTotal,
      complete: false,
    });
  };

  try {
    // Phase 1: Prefetch chunks (fast, ~1-3 seconds)
    reportProgress('chunks', 0, 0, 15);
    await prefetchCriticalChunks();
    chunksLoaded = 13;
    reportProgress('chunks', chunksLoaded, 0, 15);
    logger.log('[OfflinePrep] ✅ Phase 1 complete: chunks loaded');

    // Phase 2: Wait for data sync (may take longer)
    reportProgress('data', chunksLoaded, 0, 15);

    // Import replication manager dynamically to avoid circular deps
    const { getReplicationManager } = await import('../services/replication');

    const manager = getReplicationManager();
    if (manager) {
      // Trigger a full sync and wait for it
      const syncPromise = manager.syncAll({ licenseKey, forceFullSync: false });

      // Race between sync completion and timeout
      const remainingTime = timeoutMs - (performance.now() - startTime);
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), Math.max(remainingTime, 5000))
      );

      const result = await Promise.race([syncPromise, timeoutPromise]);

      if (result !== null) {
        // Sync completed
        const successCount = result.filter((r: { success: boolean }) => r.success).length;
        dataSynced = successCount > 0;
        reportProgress('data', chunksLoaded, successCount, result.length);
        logger.log(`[OfflinePrep] ✅ Phase 2 complete: ${successCount}/${result.length} tables synced`);
      } else {
        // Timeout - sync still running in background
        logger.warn('[OfflinePrep] ⚠️ Data sync timed out, continuing in background');
        reportProgress('data', chunksLoaded, 0, 15);
      }
    } else {
      logger.warn('[OfflinePrep] ⚠️ Replication manager not available');
    }

    const elapsed = Math.round(performance.now() - startTime);
    logger.log(`[OfflinePrep] ✅ Complete in ${elapsed}ms`);

    // Only mark as prepared if sync actually completed (not timed out)
    // This ensures subsequent logins will still wait for sync if previous one timed out
    if (dataSynced) {
      markPrepared(licenseKey);
    } else {
      logger.warn('[OfflinePrep] ⚠️ Not marking as prepared - sync timed out or incomplete');
    }

    onProgress?.({
      phase: 'data',
      chunksLoaded,
      chunksTotal: 13,
      dataTablesReady: dataSynced ? 15 : 0,
      dataTablesTotal: 15,
      complete: true,
    });

    return { success: true, chunksLoaded, dataSynced };
  } catch (error) {
    logger.error('[OfflinePrep] ❌ Error during preparation:', error);
    return { success: false, chunksLoaded, dataSynced };
  }
}
