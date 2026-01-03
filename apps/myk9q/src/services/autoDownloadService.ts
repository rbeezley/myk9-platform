/**
 * Auto-Download Service
 *
 * Automatically downloads entire show data on login for offline use.
 * Only downloads for admin/judge/steward roles (not exhibitors).
 *
 * Strategy:
 * - One passcode = one show (1:1 relationship via license key)
 * - Downloads ALL classes and entries for that show
 * - Typical size: ~0.5 MB (50 classes, 600+ entries)
 * - Cache freshness: 30 minutes (prevents redundant downloads)
 * - Non-blocking: Runs in background, doesn't delay navigation
 * - Fail-safe: Errors are logged but don't block app usage
 */

import { getClassEntries } from './entryService';
import { supabase } from '../lib/supabase';
import { prefetchCache } from '@/services/replication/PrefetchCacheManager';
import { logger } from '@/utils/logger';

interface DownloadProgress {
  current: number;
  total: number;
  classId: number;
  className: string;
}

interface DownloadResult {
  success: boolean;
  downloaded: number;
  total: number;
  errors: number[];
}

interface CachedDownload {
  downloaded: boolean;
  classCount: number;
  timestamp: number;
}

/** Class data from Supabase with nested trial info */
interface ClassWithTrial {
  id: number;
  element: string;
  level: string;
  section: string;
  trials: { id: number; trial_number: number } | Array<{ id: number; trial_number: number }>;
}

/**
 * Auto-download entire show for offline use
 * Downloads all classes and entries for the given license key
 *
 * @param licenseKey - License key tied to the passcode (one show per passcode)
 * @param onProgress - Optional progress callback for UI updates
 * @returns Promise with download results
 */
export async function autoDownloadShow(
  licenseKey: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {

  try {
// 1. Check if already cached and fresh (< 30 min old)
    const cacheKey = `auto-download-${licenseKey}`;
    const cached = await prefetchCache.get<CachedDownload>(cacheKey);

    if (cached && cached.data.downloaded && Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return {
        success: true,
        downloaded: cached.data.classCount,
        total: cached.data.classCount,
        errors: []
      };
    }

    // 2. Get show ID for this license key (needed for trial queries)
    const { data: showData, error: showError } = await supabase
      .from('shows')
      .select('id')
      .eq('license_key', licenseKey)
      .single();

    if (showError || !showData) {
      logger.error('❌ [AUTO-DOWNLOAD] Failed to fetch show:', showError);
      return { success: false, downloaded: 0, total: 0, errors: [] };
    }

    const showId = showData.id;

    // 3. Get ALL classes for this show (via license key)
    // One passcode = one license key = one show
    const { data: classes, error } = await supabase
      .from('classes')
      .select(`
        id,
        element,
        level,
        section,
        trials!inner(
          id,
          trial_number,
          shows!inner(
            license_key
          )
        )
      `)
      .eq('trials.shows.license_key', licenseKey)
      .order('element', { ascending: true })
      .order('level', { ascending: true });

    if (error) {
      logger.error('❌ [AUTO-DOWNLOAD] Failed to fetch classes:', error);
      return { success: false, downloaded: 0, total: 0, errors: [] };
    }

    if (!classes || classes.length === 0) {
return { success: false, downloaded: 0, total: 0, errors: [] };
    }

    // Sort classes by trial_number first (can't do this in PostgREST for joined columns)
    const sortedClasses = (classes as ClassWithTrial[]).sort((a, b) => {
      const trialA = Array.isArray(a.trials) ? a.trials[0]?.trial_number : a.trials?.trial_number;
      const trialB = Array.isArray(b.trials) ? b.trials[0]?.trial_number : b.trials?.trial_number;

      if (trialA !== trialB) {
        return (trialA || 0) - (trialB || 0);
      }

      // Already ordered by element and level in the query
      return 0;
    });

// 3. Download each class (entries + metadata)
    // getClassEntries() automatically caches to IndexedDB via useStaleWhileRevalidate
    let downloaded = 0;
    const errors: number[] = [];

    for (const classData of sortedClasses) {
      try {
        await getClassEntries(classData.id, licenseKey);
        downloaded++;

        // Report progress for UI updates
        const className = `${classData.element} ${classData.level}${
          classData.section && classData.section !== '-' ? ` ${classData.section}` : ''
        }`;

        onProgress?.({
          current: downloaded,
          total: sortedClasses.length,
          classId: classData.id,
          className
        });

} catch (error) {
        logger.error(`❌ [AUTO-DOWNLOAD] Failed to download class ${classData.id}:`, error);
        errors.push(classData.id);
        // Continue with other classes (partial success is OK)
      }
    }

    // 4. Cache trial and class list data for offline ClassList pages
    // Get unique trial IDs from the classes
    const trialIds = [...new Set(sortedClasses.map((cls) => {
      const trial = Array.isArray(cls.trials) ? cls.trials[0] : cls.trials;
      return trial?.id;
    }))].filter(Boolean);

for (const trialId of trialIds) {
      try {
        // Cache trial info
        const { data: trialData } = await supabase
          .from('trials')
          .select('*')
          .eq('show_id', showId)
          .eq('id', trialId)
          .single();

        if (trialData) {
          await prefetchCache.set(
            `trial-info-${licenseKey}-${trialId}`,
            trialData,
            30 * 60 * 1000
          );
        }

        // Cache class summary data for this trial
        const { data: classSummary } = await supabase
          .from('view_class_summary')
          .select('*')
          .eq('trial_id', trialId)
          .order('class_order');

        if (classSummary) {
          await prefetchCache.set(
            `class-summary-${licenseKey}-${trialId}`,
            classSummary,
            30 * 60 * 1000
          );
        }

} catch (error) {
        logger.error(`⚠️ [AUTO-DOWNLOAD] Failed to cache trial ${trialId}:`, error);
        // Continue with other trials
      }
    }

    // 5. Mark as cached with timestamp
    const cacheData: CachedDownload = {
      downloaded: true,
      classCount: downloaded,
      timestamp: Date.now()
    };

    await prefetchCache.set(cacheKey, cacheData, 30 * 60 * 1000); // 30 min TTL

    const success = errors.length === 0;
    if (errors.length > 0) {
      logger.warn(`⚠️ [AUTO-DOWNLOAD] Failed to download ${errors.length} classes:`, errors);
    }

    return {
      success,
      downloaded,
      total: sortedClasses.length,
      errors
    };

  } catch (error) {
    logger.error('❌ [AUTO-DOWNLOAD] Unexpected error:', error);
    return { success: false, downloaded: 0, total: 0, errors: [] };
  }
}

/**
 * Check if show is already cached for offline use
 *
 * @param licenseKey - License key for the show
 * @returns True if cached and fresh (< 30 min old)
 */
export async function isShowCached(licenseKey: string): Promise<boolean> {
  try {
    const cacheKey = `auto-download-${licenseKey}`;
    const cached = await prefetchCache.get<CachedDownload>(cacheKey);

    if (!cached || !cached.data.downloaded) {
      return false;
    }

    // Consider cached if < 30 min old
    const isFresh = Date.now() - cached.timestamp < 30 * 60 * 1000;
    return isFresh;

  } catch (error) {
    logger.error('❌ [AUTO-DOWNLOAD] Error checking cache status:', error);
    return false;
  }
}

/**
 * Get cache status for a show
 *
 * @param licenseKey - License key for the show
 * @returns Cache status with age and class count
 */
export async function getCacheStatus(licenseKey: string) {
  try {
    const cacheKey = `auto-download-${licenseKey}`;
    const cached = await prefetchCache.get<CachedDownload>(cacheKey);

    if (!cached || !cached.data.downloaded) {
      return {
        isCached: false,
        age: null,
        classCount: 0,
        ageMinutes: 0
      };
    }

    const age = Date.now() - cached.timestamp;
    const ageMinutes = Math.round(age / 60000);
    const isFresh = age < 30 * 60 * 1000;

    return {
      isCached: isFresh,
      age, // milliseconds
      ageMinutes, // minutes
      classCount: cached.data.classCount || 0
    };

  } catch (error) {
    logger.error('❌ [AUTO-DOWNLOAD] Error getting cache status:', error);
    return {
      isCached: false,
      age: null,
      classCount: 0,
      ageMinutes: 0
    };
  }
}

/**
 * Clear auto-download cache for a show
 * Useful for forcing a fresh download
 *
 * @param licenseKey - License key for the show
 */
export async function clearAutoDownloadCache(licenseKey: string): Promise<void> {
  try {
    const cacheKey = `auto-download-${licenseKey}`;
    await prefetchCache.delete(cacheKey);
  } catch (error) {
    logger.error('❌ [AUTO-DOWNLOAD] Error clearing cache:', error);
  }
}
