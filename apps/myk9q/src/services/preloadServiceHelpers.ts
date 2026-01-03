/**
 * PreloadService Helper Functions
 *
 * Extracted from preloadService.ts to reduce complexity.
 * Contains stage-specific data fetching and processing logic.
 */

import { supabase } from '@/lib/supabase';
import { prefetchCache } from '@/services/replication/PrefetchCacheManager';
import type { Entry } from '@/stores/entryStore';
import type { PreloadProgress } from './preloadService';

// ============================================================================
// Types
// ============================================================================

export interface StageResult<T> {
  data: T;
  count: number;
}

export interface ShowEstimate {
  classCount: number;
  trialCount: number;
  entryCount: number;
  totalItems: number;
}

export interface FetchedData {
  classes: unknown[];
  trials: unknown[];
  entries: Entry[];
}

// ============================================================================
// Progress Helper
// ============================================================================

export type ProgressCallback = (progress: PreloadProgress) => void;

export function createProgressUpdater(onProgress?: ProgressCallback) {
  return (
    stage: PreloadProgress['stage'],
    current: number,
    total: number,
    currentItemName?: string,
    error?: string
  ) => {
    const progress: PreloadProgress = {
      stage,
      current,
      total,
      percentage: total > 0 ? Math.round((current / total) * 100) : 0,
      currentItem: currentItemName,
      error,
    };
    onProgress?.(progress);
  };
}

// ============================================================================
// Abort Check Helper
// ============================================================================

export function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Download cancelled');
  }
}

// ============================================================================
// Stage Fetching Functions
// ============================================================================

/**
 * Fetch show info from database
 */
export async function fetchShowInfo(
  licenseKey: string
): Promise<{ name: string }> {
  const { data: showData, error: showError } = await supabase
    .from('shows')
    .select('name')
    .eq('license_key', licenseKey)
    .single();

  if (showError || !showData) {
    throw new Error('Show not found');
  }

  return showData;
}

/**
 * Fetch and cache classes for a show
 */
export async function fetchAndCacheClasses(
  licenseKey: string,
  ttl: number,
  signal?: AbortSignal
): Promise<StageResult<unknown[]>> {
  checkAborted(signal);

  const { data: classes, error: classError } = await supabase
    .from('classes')
    .select('*')
    .eq('license_key', licenseKey);

  if (classError) throw classError;
  checkAborted(signal);

  // Cache classes
  const classesKey = `classes:${licenseKey}`;
  await prefetchCache.set(classesKey, classes || [], ttl);

  return {
    data: classes || [],
    count: classes?.length || 0,
  };
}

/**
 * Fetch and cache trials for a show
 */
export async function fetchAndCacheTrials(
  licenseKey: string,
  ttl: number,
  signal?: AbortSignal
): Promise<StageResult<unknown[]>> {
  checkAborted(signal);

  const { data: trials, error: trialError } = await supabase
    .from('trials')
    .select('*')
    .eq('license_key', licenseKey);

  if (trialError) throw trialError;
  checkAborted(signal);

  // Cache trials
  const trialsKey = `trials:${licenseKey}`;
  await prefetchCache.set(trialsKey, trials || [], ttl);

  return {
    data: trials || [],
    count: trials?.length || 0,
  };
}

/**
 * Fetch and cache entries for a show (in batches)
 */
export async function fetchAndCacheEntries(
  licenseKey: string,
  ttl: number,
  estimatedCount: number,
  batchSize: number,
  onBatchProgress: (fetched: number, total: number) => void,
  signal?: AbortSignal
): Promise<StageResult<Entry[]>> {
  const allEntries: Entry[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    checkAborted(signal);

    const { data: entriesBatch, error: entryError } = await supabase
      .from('view_entry_class_join_normalized')
      .select('*')
      .eq('license_key', licenseKey)
      .range(offset, offset + batchSize - 1)
      .order('armband_number', { ascending: true });

    if (entryError) throw entryError;

    if (!entriesBatch || entriesBatch.length === 0) {
      hasMore = false;
    } else {
      allEntries.push(...entriesBatch);
      offset += batchSize;
      onBatchProgress(allEntries.length, estimatedCount);
    }
  }

  // Cache all entries
  const entriesKey = `entries:${licenseKey}`;
  await prefetchCache.set(entriesKey, allEntries, ttl);

  return {
    data: allEntries,
    count: allEntries.length,
  };
}

// ============================================================================
// Metadata Helper
// ============================================================================

/**
 * Calculate actual data size and create preloaded show metadata
 */
export function createPreloadedShowMetadata(
  licenseKey: string,
  showName: string,
  fetchedData: FetchedData,
  ttl: number
): {
  licenseKey: string;
  showName: string;
  downloadedAt: number;
  expiresAt: number;
  size: number;
  classCount: number;
  trialCount: number;
  entryCount: number;
} {
  // Calculate actual size (rough estimate)
  const actualSize = JSON.stringify(fetchedData).length;

  return {
    licenseKey,
    showName,
    downloadedAt: Date.now(),
    expiresAt: Date.now() + ttl,
    size: actualSize,
    classCount: fetchedData.classes.length,
    trialCount: fetchedData.trials.length,
    entryCount: fetchedData.entries.length,
  };
}
