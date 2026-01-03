/**
 * React Query hooks for DogDetails page
 *
 * Replaces manual data fetching with React Query for automatic caching and background refetching.
 * Benefits:
 * - Automatic caching with configurable stale/cache times
 * - Deduplication (multiple components requesting same data = 1 network call)
 * - Background refetching
 * - Built-in loading/error states
 * - Query invalidation helpers
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { VisibleResultFields, VisibilityTiming } from '../../../types/visibility';
import type { CheckinStatus } from '../../../components/dialogs/CheckinStatusDialog';
import type { UserRole } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { ensureReplicationManager } from '../../../utils/replicationHelper';
import type { Entry } from '../../../services/replication/tables/ReplicatedEntriesTable';
import type { Class } from '../../../services/replication/tables/ReplicatedClassesTable';
import type { Trial } from '../../../services/replication/tables/ReplicatedTrialsTable';
import {
  extractDogInfo,
  processEntriesToClassEntries,
  type ClassData,
  type TrialData
} from './dogDetailsDataHelpers';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface ClassEntry {
  id: number; // Entry ID (for status updates)
  class_id: number; // Class ID (for navigation)
  class_name: string;
  class_type: string;
  trial_name: string;
  trial_date: string;
  search_time: string | null;
  fault_count: number | null;
  result_text: string | null;
  is_scored: boolean;
  checked_in: boolean;
  check_in_status?: CheckinStatus;
  position?: number;
  // Additional fields
  element?: string;
  level?: string;
  section?: string;
  trial_number?: number;
  judge_name?: string;
  // Visibility control fields
  trial_id?: number;
  is_scoring_finalized?: boolean;
  results_released_at?: string | null;
  visibleFields?: VisibleResultFields;
  // For showing availability messages
  placementTiming?: VisibilityTiming;
  qualificationTiming?: VisibilityTiming;
  timeTiming?: VisibilityTiming;
  faultsTiming?: VisibilityTiming;
  // Queue position (dogs ahead in line)
  queuePosition?: number;
}

export interface DogInfo {
  armband: number;
  call_name: string;
  breed: string;
  handler: string;
}

export interface DogDetailsData {
  dogInfo: DogInfo | null;
  classes: ClassEntry[];
}

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const dogDetailsKeys = {
  all: (armband: string) => ['dogDetails', armband] as const,
  details: (armband: string, licenseKey: string) => ['dogDetails', armband, licenseKey] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Fetch dog details with all class entries
 * Uses replicated cache (direct replacement, no feature flags)
 */
async function fetchDogDetails(
  armband: string | undefined,
  licenseKey: string | undefined,
  currentRole: UserRole | null | undefined
): Promise<DogDetailsData> {
  if (!armband || !licenseKey) {
    logger.log('⏸️ Skipping dog details fetch - armband or licenseKey not ready yet');
    return { dogInfo: null, classes: [] };
  }

  logger.log('[REPLICATION] 🔍 Fetching dog details for armband:', armband);

  try {
    // Load from replicated cache - ensure it's initialized
    const manager = await ensureReplicationManager();

    const entriesTable = manager.getTable('entries');
    const classesTable = manager.getTable('classes');
    const trialsTable = manager.getTable('trials');

    if (!entriesTable || !classesTable || !trialsTable) {
      throw new Error('Required tables not registered');
    }

    // Get all entries for this show and filter by armband
    // CRITICAL: Pass license_key to filter entries to current show only (multi-tenant isolation)
    const allEntries = await entriesTable.getAll(licenseKey) as Entry[];
    const dogEntries = allEntries.filter(
      entry => entry.armband_number === parseInt(armband)
    );

    // If cache is empty, fall back to Supabase (cache may still be syncing)
    if (dogEntries.length === 0) {
      logger.log('[REPLICATION] 📭 No dog found with armband in cache, falling back to Supabase');
      // Fall through to Supabase query below
    } else {
      logger.log(`[REPLICATION] ✅ Found ${dogEntries.length} entries for armband ${armband}`);

      // Get all classes and trials for joins
      // CRITICAL: Pass license_key to filter to current show only (multi-tenant isolation)
      const allClasses = await classesTable.getAll(licenseKey) as Class[];
      const allTrials = await trialsTable.getAll(licenseKey) as Trial[];

      // If classes haven't synced yet, fall back to Supabase to avoid "Unknown Class" display
      if (allClasses.length === 0) {
        logger.warn('[DogDetails] ⚠️ No classes found in cache - falling back to Supabase for complete data');
        // Fall through to Supabase query below
      } else {
        // Create lookup maps for performance
        const classMap = new Map<string, ClassData>(allClasses.map(c => [String(c.id), c as ClassData]));
        const trialMap = new Map<string, TrialData>(allTrials.map(t => [String(t.id), t as TrialData]));

        // Extract dog info and process entries using helpers
        // Pass allEntries to calculate queue position for each class
        const dogInfo = extractDogInfo(dogEntries[0]);
        const classesWithVisibility = await processEntriesToClassEntries(
          dogEntries,
          licenseKey,
          currentRole,
          classMap,
          trialMap,
          allEntries // Pass all entries for queue position calculation
        );

        return { dogInfo, classes: classesWithVisibility };
      }
    }

  } catch (error) {
    logger.error('[REPLICATION] ❌ Error loading dog details from cache, falling back to Supabase:', error);
  }

  // Fall back to original Supabase implementation
  logger.log('[REPLICATION] 📡 Fetching dog details from Supabase...');

  try {
    // Import supabase for fallback
    const { supabase } = await import('../../../lib/supabase');

    // Query view_entry_class_join_normalized for this armband
    const { data: entries, error } = await supabase
      .from('view_entry_class_join_normalized')
      .select('*')
      .eq('armband_number', parseInt(armband))
      .eq('license_key', licenseKey);

    if (error) throw error;

    if (!entries || entries.length === 0) {
      logger.log('[REPLICATION] 📭 No dog found with armband in Supabase:', armband);
      return { dogInfo: null, classes: [] };
    }

    logger.log(`[REPLICATION] ✅ Loaded ${entries.length} entries from Supabase for armband ${armband}`);

    // For queue position, we need all entries in the classes this dog is entered in
    // Get the unique class IDs from the dog's entries
    const classIds = [...new Set(entries.map(e => e.class_id))];

    // Fetch all entries for those classes to calculate queue position
    const { data: allClassEntries, error: classEntriesError } = await supabase
      .from('view_entry_class_join_normalized')
      .select('id, class_id, armband_number, entry_status, is_scored, exhibitor_order')
      .in('class_id', classIds)
      .eq('license_key', licenseKey);

    if (classEntriesError) {
      logger.warn('[REPLICATION] ⚠️ Could not fetch class entries for queue position:', classEntriesError);
    }

    // Extract dog info and process entries using helpers
    const dogInfo = extractDogInfo(entries[0]);
    const classesWithVisibility = await processEntriesToClassEntries(
      entries,
      licenseKey,
      currentRole,
      undefined, // no classMap for Supabase fallback
      undefined, // no trialMap for Supabase fallback
      allClassEntries || undefined // Pass all class entries for queue position
    );

    return { dogInfo, classes: classesWithVisibility };

  } catch (error) {
    logger.error('[REPLICATION] ❌ Error loading dog details from Supabase:', error);
    throw error;
  }
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to fetch dog details with class entries
 *
 * Real-time updates via replication cache subscription:
 * - Subscribes to entries table changes (check-in status, scores, queue position)
 * - Invalidates React Query cache when replication cache updates
 * - Instant updates without polling overhead
 */
export function useDogDetailsData(
  armband: string | undefined,
  licenseKey: string | undefined,
  currentRole: UserRole | null | undefined
) {
  const queryClient = useQueryClient();
  const queryKey = dogDetailsKeys.details(armband || '', licenseKey || '');

  // Subscribe to replication cache changes for real-time updates
  // When entries change (check-in, scores, run order), invalidate the query
  useEffect(() => {
    if (!armband || !licenseKey) return;

    let unsubscribeEntries: (() => void) | undefined;
    let unsubscribeClasses: (() => void) | undefined;
    let isMounted = true;
    // Track if we've done the initial callback for each subscription
    // subscribe() immediately calls back with current data - we need to skip that
    let entriesInitialDone = false;
    let classesInitialDone = false;
    // Debounce invalidation to coalesce rapid notifications
    let invalidationTimeout: ReturnType<typeof setTimeout> | null = null;
    const INVALIDATION_DEBOUNCE_MS = 500;

    const setupSubscriptions = async () => {
      try {
        const manager = await ensureReplicationManager();
        const entriesTable = manager.getTable('entries');
        const classesTable = manager.getTable('classes');

        if (!isMounted) return;

        // Debounced invalidation function
        const debouncedInvalidate = () => {
          if (!isMounted) return;
          if (invalidationTimeout) {
            clearTimeout(invalidationTimeout);
          }
          invalidationTimeout = setTimeout(() => {
            if (!isMounted) return;
            logger.log('[DogDetails] 🔄 Invalidating query after debounce');
            queryClient.invalidateQueries({ queryKey });
          }, INVALIDATION_DEBOUNCE_MS);
        };

        if (entriesTable) {
          unsubscribeEntries = entriesTable.subscribe(() => {
            // Skip the immediate callback that subscribe() triggers
            if (!entriesInitialDone) {
              entriesInitialDone = true;
              return;
            }
            debouncedInvalidate();
          });
        }

        if (classesTable) {
          unsubscribeClasses = classesTable.subscribe(() => {
            // Skip the immediate callback that subscribe() triggers
            if (!classesInitialDone) {
              classesInitialDone = true;
              return;
            }
            debouncedInvalidate();
          });
        }

        logger.log('[DogDetails] ✅ Subscribed to real-time cache updates');
      } catch (error) {
        logger.error('[DogDetails] ❌ Failed to subscribe to cache updates:', error);
      }
    };

    setupSubscriptions();

    return () => {
      isMounted = false;
      if (invalidationTimeout) clearTimeout(invalidationTimeout);
      if (unsubscribeEntries) unsubscribeEntries();
      if (unsubscribeClasses) unsubscribeClasses();
      logger.log('[DogDetails] 🗑️ Unsubscribed from cache updates');
    };
  }, [armband, licenseKey, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: () => fetchDogDetails(armband, licenseKey, currentRole),
    enabled: !!armband && !!licenseKey, // Only run if both are provided
    staleTime: 30 * 1000, // 30 seconds - data stays fresh longer since we have real-time invalidation
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    // No polling needed - real-time updates via cache subscription above
  });
}
