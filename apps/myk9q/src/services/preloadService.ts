/**
 * Pre-download Service
 *
 * Allows users to download entire shows for offline use.
 * This is especially useful for judges/stewards working in areas with poor WiFi.
 *
 * Features:
 * - Download all entries, classes, trials for a show
 * - Progress tracking with granular updates
 * - Pause/resume capability
 * - Automatic retry on failure
 * - Storage estimation
 * - Cleanup of old downloads
 */

import { supabase } from '@/lib/supabase';
import { prefetchCache } from '@/services/replication/PrefetchCacheManager';
import { logger } from '@/utils/logger';

// Extracted helpers for reduced complexity
import {
  createProgressUpdater,
  fetchShowInfo,
  fetchAndCacheClasses,
  fetchAndCacheTrials,
  fetchAndCacheEntries,
  createPreloadedShowMetadata,
  checkAborted,
} from './preloadServiceHelpers';

export interface PreloadProgress {
  stage: 'preparing' | 'classes' | 'trials' | 'entries' | 'complete' | 'error';
  current: number;
  total: number;
  percentage: number;
  currentItem?: string;
  error?: string;
}

export interface PreloadedShow {
  licenseKey: string;
  showName: string;
  downloadedAt: number;
  expiresAt: number;
  size: number; // bytes
  classCount: number;
  trialCount: number;
  entryCount: number;
}

export interface PreloadOptions {
  licenseKey: string;
  onProgress?: (progress: PreloadProgress) => void;
  ttl?: number; // Time-to-live in milliseconds (default: 7 days)
  signal?: AbortSignal; // For cancellation
}

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const BATCH_SIZE = 50; // Fetch entries in batches

/**
 * Estimate storage required for downloading a show
 */
export async function estimateShowSize(licenseKey: string): Promise<{
  estimatedBytes: number;
  classCount: number;
  trialCount: number;
  entryCount: number;
}> {
  try {
    // Get counts for all data
    const [classesResult, trialsResult, entriesResult] = await Promise.all([
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('license_key', licenseKey),
      supabase
        .from('trials')
        .select('id', { count: 'exact', head: true })
        .eq('license_key', licenseKey),
      supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('license_key', licenseKey),
    ]);

    const classCount = classesResult.count || 0;
    const trialCount = trialsResult.count || 0;
    const entryCount = entriesResult.count || 0;

    // Rough estimation: 1KB per class, 1KB per trial, 2KB per entry
    const estimatedBytes = (classCount * 1024) + (trialCount * 1024) + (entryCount * 2048);

    return {
      estimatedBytes,
      classCount,
      trialCount,
      entryCount,
    };
  } catch (error) {
    logger.error('❌ Failed to estimate show size:', error);
    throw error;
  }
}

/**
 * Download an entire show for offline use
 */
export async function preloadShow(options: PreloadOptions): Promise<PreloadedShow> {
  const { licenseKey, onProgress, ttl = DEFAULT_TTL, signal } = options;

  let totalItems = 0;
  let currentItem = 0;

  const updateProgress = createProgressUpdater(onProgress);

  try {
    // Stage 1: Preparing - fetch show info
    updateProgress('preparing', 0, 1);
    const showData = await fetchShowInfo(licenseKey);
    checkAborted(signal);

    // Get counts for progress tracking
    const estimate = await estimateShowSize(licenseKey);
    totalItems = estimate.classCount + estimate.trialCount + estimate.entryCount;

    // Stage 2: Download and cache classes
    updateProgress('classes', 0, estimate.classCount);
    const classesResult = await fetchAndCacheClasses(licenseKey, ttl, signal);
    currentItem += classesResult.count;
    updateProgress('classes', classesResult.count, estimate.classCount);

    // Stage 3: Download and cache trials
    updateProgress('trials', 0, estimate.trialCount);
    const trialsResult = await fetchAndCacheTrials(licenseKey, ttl, signal);
    currentItem += trialsResult.count;
    updateProgress('trials', trialsResult.count, estimate.trialCount);

    // Stage 4: Download and cache entries (in batches)
    updateProgress('entries', 0, estimate.entryCount);
    const entriesResult = await fetchAndCacheEntries(
      licenseKey,
      ttl,
      estimate.entryCount,
      BATCH_SIZE,
      (fetched, total) => {
        updateProgress('entries', fetched, total, `Entry ${fetched}/${total}`);
      },
      signal
    );
    currentItem += entriesResult.count;

    // Create and save show metadata
    const preloadedShow = createPreloadedShowMetadata(
      licenseKey,
      showData.name,
      {
        classes: classesResult.data,
        trials: trialsResult.data,
        entries: entriesResult.data,
      },
      ttl
    );

    // Store metadata using prefetchCache with 'metadata:' prefix
    await prefetchCache.set(`metadata:preloaded-show:${licenseKey}`, preloadedShow, ttl);

    // Stage 5: Complete
    updateProgress('complete', totalItems, totalItems);

    return preloadedShow;

  } catch (error) {
    logger.error('❌ Failed to preload show:', error);
    updateProgress(
      'error',
      currentItem,
      totalItems,
      undefined,
      error instanceof Error ? error.message : 'Unknown error'
    );
    throw error;
  }
}

/**
 * Check if a show is already downloaded
 */
export async function isShowPreloaded(licenseKey: string): Promise<boolean> {
  try {
    const cached = await prefetchCache.get<PreloadedShow>(`metadata:preloaded-show:${licenseKey}`);
    if (!cached?.data) return false;

    const show = cached.data;

    // Check if expired
    if (show.expiresAt < Date.now()) {
      await deletePreloadedShow(licenseKey);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('❌ Failed to check if show is preloaded:', error);
    return false;
  }
}

/**
 * Get metadata about a preloaded show
 */
export async function getPreloadedShow(licenseKey: string): Promise<PreloadedShow | null> {
  try {
    const cached = await prefetchCache.get<PreloadedShow>(`metadata:preloaded-show:${licenseKey}`);
    if (!cached?.data) return null;

    const show = cached.data;

    // Check if expired
    if (show.expiresAt < Date.now()) {
      await deletePreloadedShow(licenseKey);
      return null;
    }

    return show;
  } catch (error) {
    logger.error('❌ Failed to get preloaded show:', error);
    return null;
  }
}

/**
 * Get all preloaded shows
 */
export async function getAllPreloadedShows(): Promise<PreloadedShow[]> {
  try {
    const allCached = await prefetchCache.getAll();

    // Filter for preloaded show metadata entries
    const showEntries = allCached.filter((entry) => entry.key.startsWith('metadata:preloaded-show:'));

    // Filter out expired shows
    const now = Date.now();
    const validShows: PreloadedShow[] = [];

    for (const entry of showEntries) {
      const show = entry.data as PreloadedShow;
      if (show.expiresAt > now) {
        validShows.push(show);
      } else {
        // Clean up expired show
        await deletePreloadedShow(show.licenseKey);
      }
    }

    return validShows;
  } catch (error) {
    logger.error('❌ Failed to get all preloaded shows:', error);
    return [];
  }
}

/**
 * Delete a preloaded show
 */
export async function deletePreloadedShow(licenseKey: string): Promise<void> {
  try {
    // Delete cached data
    await Promise.all([
      prefetchCache.delete(`classes:${licenseKey}`),
      prefetchCache.delete(`trials:${licenseKey}`),
      prefetchCache.delete(`entries:${licenseKey}`),
      prefetchCache.delete(`metadata:preloaded-show:${licenseKey}`),
    ]);
  } catch (error) {
    logger.error('❌ Failed to delete preloaded show:', error);
    throw error;
  }
}

/**
 * Get total storage usage by preloaded shows
 */
export async function getTotalStorageUsage(): Promise<{
  totalBytes: number;
  showCount: number;
  shows: PreloadedShow[];
}> {
  try {
    const shows = await getAllPreloadedShows();
    const totalBytes = shows.reduce((sum, show) => sum + show.size, 0);

    return {
      totalBytes,
      showCount: shows.length,
      shows,
    };
  } catch (error) {
    logger.error('❌ Failed to get storage usage:', error);
    return {
      totalBytes: 0,
      showCount: 0,
      shows: [],
    };
  }
}

/**
 * Clean up old/expired preloaded shows
 */
export async function cleanupExpiredShows(): Promise<number> {
  try {
    const allCached = await prefetchCache.getAll();
    const showEntries = allCached.filter((entry) => entry.key.startsWith('metadata:preloaded-show:'));
    const now = Date.now();
    let deletedCount = 0;

    for (const entry of showEntries) {
      const show = entry.data as PreloadedShow;
      if (show.expiresAt < now) {
        await deletePreloadedShow(show.licenseKey);
        deletedCount++;
      }
    }

    return deletedCount;
  } catch (error) {
    logger.error('❌ Failed to cleanup expired shows:', error);
    return 0;
  }
}

/**
 * Extend expiration of a preloaded show
 */
export async function extendShowExpiration(
  licenseKey: string,
  additionalTtl: number = DEFAULT_TTL
): Promise<PreloadedShow | null> {
  try {
    const show = await getPreloadedShow(licenseKey);
    if (!show) return null;

    show.expiresAt = Date.now() + additionalTtl;
    await prefetchCache.set(`metadata:preloaded-show:${licenseKey}`, show, additionalTtl);

    return show;
  } catch (error) {
    logger.error('❌ Failed to extend show expiration:', error);
    return null;
  }
}
