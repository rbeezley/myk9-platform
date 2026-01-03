/**
 * React Query hooks for ClassList page
 *
 * Replaces useStaleWhileRevalidate with React Query for automatic caching and background refetching.
 * Benefits:
 * - Automatic caching with configurable stale/cache times
 * - Deduplication (multiple components requesting same data = 1 network call)
 * - Background refetching
 * - Built-in loading/error states
 * - Query invalidation helpers
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { getClassEntries } from '../../../services/entryService';
import { getLevelSortOrder } from '../../../lib/utils';
import { logger } from '../../../utils/logger';
import { prefetchCache } from '@/services/replication/PrefetchCacheManager';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import type { Entry } from '@/services/replication/tables/ReplicatedEntriesTable';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/** Cached trial data from IndexedDB */
interface CachedTrialData {
  trial_name: string;
  trial_date: string;
  trial_number?: number;
  trialid?: number; // Legacy field name
}

/** Cached class data from IndexedDB (view_class_summary format) */
interface CachedClassData {
  class_id: number;
  element: string;
  level: string;
  section: string;
  class_name?: string;
  class_order?: number;
  class_type?: string;
  judge_name?: string;
  is_scoring_finalized?: boolean;
  class_status?: string;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  briefing_time?: string;
  break_until?: string;
  start_time?: string;
  self_checkin_enabled?: boolean;
}

/** Visibility override data from class_result_visibility_overrides table */
interface VisibilityOverride {
  class_id: number;
  preset_name: 'open' | 'standard' | 'review';
}

export interface ClassEntry {
  id: number;
  element: string;
  level: string;
  section: string;
  class_name: string;
  class_order: number;
  judge_name: string;
  entry_count: number;
  completed_count: number;
  class_status: 'no-status' | 'setup' | 'briefing' | 'break' | 'start_time' | 'in_progress' | 'offline-scoring' | 'completed';
  is_scoring_finalized?: boolean;
  is_favorite: boolean;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  start_time?: string;
  briefing_time?: string;
  break_until?: string;
  planned_start_time?: string;
  last_result_at?: string; // Timestamp of last synced result (for stale data detection)
  pairedClassId?: number; // For combined Novice A & B classes
  self_checkin_enabled?: boolean; // Check-in mode
  visibility_preset?: 'open' | 'standard' | 'review'; // Result visibility setting
  dogs: {
    id: number;
    armband: number;
    call_name: string;
    breed: string;
    handler: string;
    in_ring: boolean;
    checkin_status: number;
    is_scored: boolean;
    exhibitor_order: number;
  }[];
}

export interface TrialInfo {
  trial_name: string;
  trial_date: string;
  trial_number: number;
  total_classes: number;
  pending_classes: number;
  completed_classes: number;
}

export interface ClassListData {
  trialInfo: TrialInfo | null;
  classes: ClassEntry[];
}

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const classListKeys = {
  all: (trialId: string) => ['classList', trialId] as const,
  trialInfo: (trialId: string) => ['classList', trialId, 'trialInfo'] as const,
  classes: (trialId: string) => ['classList', trialId, 'classes'] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Fetch trial information
 */
async function fetchTrialInfo(
  trialId: string | undefined,
  showId: string | number | undefined,
  licenseKey?: string
): Promise<TrialInfo | null> {
  if (!trialId || !showId) {
    logger.log('⏸️ Skipping trial info fetch - trialId or showId not ready yet');
    return null;
  }

  logger.log('🔍 Fetching trial info for trial ID:', trialId);

  // Try IndexedDB cache first (for offline support)
  if (licenseKey) {
    const cached = await prefetchCache.get(`trial-info-${licenseKey}-${trialId}`);
    if (cached && cached.data) {
      logger.log('✅ Using cached trial info from IndexedDB');
      const trialData = cached.data as CachedTrialData;

      // Still need to load class data for counts
      const cachedClassData = await prefetchCache.get(`class-summary-${licenseKey}-${trialId}`);
      if (cachedClassData && cachedClassData.data) {
        const classData = cachedClassData.data as CachedClassData[];
        return {
          trial_name: trialData.trial_name,
          trial_date: trialData.trial_date,
          trial_number: trialData.trial_number ?? trialData.trialid ?? 0,
          total_classes: classData.length || 0,
          pending_classes: classData.filter((c) => c.is_scoring_finalized !== true).length || 0,
          completed_classes: classData.filter((c) => c.is_scoring_finalized === true).length || 0
        };
      }
    }
  }

  // Load trial info using normalized table
  const { data: trialData, error: trialError } = await supabase
    .from('trials')
    .select('*')
    .eq('show_id', showId)
    .eq('id', parseInt(trialId))
    .single();

  if (trialError) {
    logger.error('❌ Error loading trial:', trialError);
    throw trialError;
  }

  if (!trialData) return null;

  logger.log('✅ Trial data loaded:', trialData);

  // Load classes to calculate trial info counts
  const { data: classData } = await supabase
    .from('view_class_summary')
    .select('*')
    .eq('trial_id', parseInt(trialId))
    .order('class_order');

  // Build trial info with counts
  const trialInfo: TrialInfo = {
    trial_name: trialData.trial_name,
    trial_date: trialData.trial_date,
    trial_number: trialData.trial_number || trialData.trialid,
    total_classes: classData?.length || 0,
    pending_classes: classData?.filter(c => c.is_scoring_finalized !== true).length || 0,
    completed_classes: classData?.filter(c => c.is_scoring_finalized === true).length || 0
  };

  return trialInfo;
}

/**
 * Process classes with entry data
 * Shared logic for both replicated cache and Supabase fallback
 */
async function processClassesWithEntries(
  classesData: Class[],
  entriesData: Entry[],
  _licenseKey: string
): Promise<ClassEntry[]> {
  // Build a map of classId -> entries
  // CRITICAL: Normalize all IDs to strings to prevent type mismatch (number vs string)
  const entriesByClass = new Map<string, Entry[]>();

  entriesData.forEach((entry) => {
    const classId = String(entry.class_id);  // Normalize to string
    if (!entriesByClass.has(classId)) {
      entriesByClass.set(classId, []);
    }
    entriesByClass.get(classId)!.push(entry);
  });

  // Process each class
  const processedClasses = classesData.map((cls) => {
    const classEntries = entriesByClass.get(String(cls.id)) || [];  // Normalize to string

    // Process dog entries with custom status priority sorting
    const dogs = classEntries
      .map((entry) => ({
        id: parseInt(entry.id, 10),
        armband: entry.armband_number,
        call_name: entry.dog_call_name,
        breed: entry.dog_breed || '',
        handler: entry.handler_name,
        in_ring: entry.is_in_ring || false,
        checkin_status:
          entry.entry_status === 'checked-in'
            ? 1
            : entry.entry_status === 'conflict'
            ? 2
            : entry.entry_status === 'pulled'
            ? 3
            : entry.entry_status === 'at-gate'
            ? 4
            : 0,
        is_scored: entry.is_scored || false,
        exhibitor_order: entry.exhibitor_order || 0,
      }))
      .sort((a, b) => {
        // Custom sort order: in-ring, at gate, checked-in, conflict, not checked-in, pulled, completed
        const getStatusPriority = (dog: typeof a) => {
          if (dog.is_scored) return 7; // Completed (last)
          if (dog.in_ring) return 1; // In-ring (first)
          if (dog.checkin_status === 4) return 2; // At gate
          if (dog.checkin_status === 1) return 3; // Checked-in
          if (dog.checkin_status === 2) return 4; // Conflict
          if (dog.checkin_status === 0) return 5; // Not checked-in (pending)
          if (dog.checkin_status === 3) return 6; // Pulled
          return 8; // Unknown status
        };

        const priorityA = getStatusPriority(a);
        const priorityB = getStatusPriority(b);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // Secondary sort by exhibitor_order (run order), then armband as fallback
        if (a.exhibitor_order !== b.exhibitor_order) {
          return a.exhibitor_order - b.exhibitor_order;
        }
        return a.armband - b.armband;
      });

    // Count totals
    const entryCount = dogs.length;
    const completedCount = dogs.filter((dog) => dog.is_scored).length;

    // Construct class name from element, level, and section
    const sectionPart =
      cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
    const className = `${cls.element} ${cls.level}${sectionPart}`.trim();

    return {
      id: parseInt(cls.id, 10),
      element: cls.element,
      level: cls.level,
      section: cls.section || '',
      class_name: className,
      class_order: cls.class_order || 999,
      judge_name: cls.judge_name || 'TBA',
      entry_count: entryCount,
      completed_count: completedCount,
      class_status: (cls.class_status?.trim() || 'no-status') as
        | 'no-status'
        | 'setup'
        | 'briefing'
        | 'break'
        | 'start_time'
        | 'in_progress'
        | 'offline-scoring'
        | 'completed',
      is_scoring_finalized: cls.is_scoring_finalized || false,
      is_favorite: false, // Will be updated by component with localStorage
      time_limit_seconds: cls.time_limit_seconds,
      time_limit_area2_seconds: cls.time_limit_area2_seconds,
      time_limit_area3_seconds: cls.time_limit_area3_seconds,
      area_count: cls.area_count,
      briefing_time: cls.briefing_time || undefined,
      break_until: cls.break_until || undefined,
      start_time: cls.start_time || undefined,
      planned_start_time: cls.planned_start_time || undefined,
      last_result_at: cls.last_result_at || undefined,
      self_checkin_enabled: cls.self_checkin_enabled ?? true, // Default to true (self check-in)
      visibility_preset: 'standard' as const, // Will be populated by fetchClasses
      dogs: dogs,
    };
  });

  // Sort classes by class_order first, then element, level, section
  const sortedClasses = processedClasses.sort((a, b) => {
    // Primary sort: class_order (ascending)
    if (a.class_order !== b.class_order) {
      return a.class_order - b.class_order;
    }

    // Secondary sort: element (alphabetical)
    if (a.element !== b.element) {
      return a.element.localeCompare(b.element);
    }

    // Tertiary sort: level (standard progression: Novice -> Advanced -> Excellent -> Master)
    const aLevelOrder = getLevelSortOrder(a.level);
    const bLevelOrder = getLevelSortOrder(b.level);

    if (aLevelOrder !== bLevelOrder) {
      return aLevelOrder - bLevelOrder;
    }

    // If same level order, sort alphabetically
    if (a.level !== b.level) {
      return a.level.localeCompare(b.level);
    }

    // Quaternary sort: section (alphabetical)
    return a.section.localeCompare(b.section);
  });

  return sortedClasses;
}

/**
 * Fetch and apply visibility presets to classes
 * Extracted to reduce nesting depth (DEBT-009)
 */
async function applyVisibilityPresets(classes: ClassEntry[]): Promise<void> {
  if (classes.length === 0) return;

  try {
    const classIds = classes.map(c => c.id);
    const { data: visibilityData } = await supabase
      .from('class_result_visibility_overrides')
      .select('class_id, preset_name')
      .in('class_id', classIds);

    // CRITICAL: Use string keys to match cls.id type (prevents silent lookup failures)
    const visibilityMap = new Map<string, 'open' | 'standard' | 'review'>();
    ((visibilityData || []) as VisibilityOverride[]).forEach((override) => {
      visibilityMap.set(String(override.class_id), override.preset_name);
    });

    // Update classes with their visibility presets
    classes.forEach(cls => {
      cls.visibility_preset = visibilityMap.get(String(cls.id)) || 'standard';
    });
  } catch (error) {
    logger.error('❌ Error fetching visibility presets:', error);
    // Continue with default 'standard' preset
  }
}

/**
 * Try to load classes from replicated cache
 * Returns null if cache is not available or empty (signals fallback needed)
 * Extracted to reduce nesting depth (DEBT-009)
 */
async function tryLoadFromReplicatedCache(
  trialId: string,
  licenseKey: string
): Promise<ClassEntry[] | null> {
  const manager = await ensureReplicationManager();
  const classesTable = manager.getTable<Class>('classes');
  const entriesTable = manager.getTable<Entry>('entries');

  if (!classesTable || !entriesTable) return null;

  // CRITICAL: Pass license_key to filter classes to current show only (multi-tenant isolation)
  const cachedClasses = await classesTable.getAll(licenseKey);
  const trialIdNum = parseInt(trialId, 10);
  const trialClasses = cachedClasses.filter((cls) => cls.trial_id === trialIdNum);

  if (trialClasses.length === 0) {
    logger.log('📭 Cache is empty, falling back to Supabase');
    return null;
  }

  // CRITICAL: Pass license_key to filter entries to current show only
  const cachedEntries = await entriesTable.getAll(licenseKey);

  if (cachedEntries.length === 0) {
    logger.log('📭 Entries cache is empty, falling back to Supabase');
    return null;
  }

  // Process classes with entry data
  const processedClasses = await processClassesWithEntries(
    trialClasses,
    cachedEntries,
    licenseKey
  );

  // Fetch and apply visibility presets
  await applyVisibilityPresets(processedClasses);

  return processedClasses;
}

/**
 * Fetch classes with entries and sorting
 */
async function fetchClasses(
  trialId: string | undefined,
  licenseKey: string | undefined
): Promise<ClassEntry[]> {
  if (!trialId || !licenseKey) {
    logger.log('⏸️ Skipping classes fetch - trialId or licenseKey not ready yet');
    return [];
  }

  // Always use replication (no feature flags - development only, no existing users)
  logger.log('🔄 Fetching classes from replicated cache...');

  try {
    const cachedResult = await tryLoadFromReplicatedCache(trialId, licenseKey);
    if (cachedResult) {
      return cachedResult;
    }
    // Cache returned null - fall through to Supabase
  } catch (error) {
    logger.error('❌ Error loading from replicated cache, falling back to Supabase:', error);
    // Fall through to Supabase query
  }

  // Fall back to original Supabase implementation
  logger.log('🔍 Fetching classes for trial ID:', trialId);

  // Try IndexedDB cache first (for offline support)
  const cached = await prefetchCache.get(`class-summary-${licenseKey}-${trialId}`);
  let classData: CachedClassData[] | null = null;

  if (cached && cached.data) {
    logger.log('✅ Using cached class summary from IndexedDB');
    classData = cached.data as CachedClassData[];
  } else {
    // Load classes with pre-calculated entry counts using view_class_summary
    const { data, error: classError } = await supabase
      .from('view_class_summary')
      .select('*')
      .eq('trial_id', parseInt(trialId))
      .order('class_order');

    if (classError) {
      logger.error('❌ Error loading classes:', classError);
      throw classError;
    }

    classData = data as CachedClassData[] | null;
  }

  if (!classData) return [];

  logger.log('✅ Class data loaded:', classData.length, 'classes');

  // Load ALL entries for this trial using getClassEntries from entryService
  // This properly queries the results table separately and joins in JavaScript
  const classIds = classData.map((c) => c.class_id);
  const allTrialEntries = await getClassEntries(classIds, licenseKey);

  // Process classes with entry data
  const processedClasses = classData.map((cls) => {
    // Filter entries for this specific class using class_id
    const entryData = allTrialEntries.filter(entry =>
      entry.classId === cls.class_id
    );

    // Process dog entries with custom status priority sorting
    const dogs = entryData.map(entry => ({
      id: entry.id,
      armband: entry.armband,
      call_name: entry.callName,
      breed: entry.breed,
      handler: entry.handler,
      in_ring: entry.status === 'in-ring',
      checkin_status: entry.status === 'checked-in' ? 1 : entry.status === 'conflict' ? 2 : entry.status === 'pulled' ? 3 : entry.status === 'at-gate' ? 4 : 0,
      is_scored: entry.isScored,
      exhibitor_order: entry.exhibitorOrder || 0
    })).sort((a, b) => {
      // Custom sort order: in-ring, at gate, checked-in, conflict, not checked-in, pulled, completed
      const getStatusPriority = (dog: typeof a) => {
        if (dog.is_scored) return 7; // Completed (last)
        if (dog.in_ring) return 1; // In-ring (first)
        if (dog.checkin_status === 4) return 2; // At gate
        if (dog.checkin_status === 1) return 3; // Checked-in
        if (dog.checkin_status === 2) return 4; // Conflict
        if (dog.checkin_status === 0) return 5; // Not checked-in (pending)
        if (dog.checkin_status === 3) return 6; // Pulled
        return 8; // Unknown status
      };

      const priorityA = getStatusPriority(a);
      const priorityB = getStatusPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Secondary sort by exhibitor_order (run order), then armband as fallback
      if (a.exhibitor_order !== b.exhibitor_order) {
        return a.exhibitor_order - b.exhibitor_order;
      }
      return a.armband - b.armband;
    });

    // Count totals
    const entryCount = dogs.length;
    const completedCount = dogs.filter(dog => dog.is_scored).length;

    // Construct class name from element, level, and section (hide section if it's a dash)
    const sectionPart = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
    const className = `${cls.element} ${cls.level}${sectionPart}`.trim();

    const classEntry: ClassEntry = {
      id: cls.class_id,
      element: cls.element,
      level: cls.level,
      section: cls.section,
      class_name: className,
      class_order: cls.class_order || 999, // Default high value for classes without order
      judge_name: cls.judge_name || 'TBA',
      entry_count: entryCount,
      completed_count: completedCount,
      class_status: (cls.class_status?.trim() || 'no-status') as ClassEntry['class_status'],
      is_scoring_finalized: cls.is_scoring_finalized || false,
      is_favorite: false, // Will be updated by component with localStorage
      time_limit_seconds: cls.time_limit_seconds,
      time_limit_area2_seconds: cls.time_limit_area2_seconds,
      time_limit_area3_seconds: cls.time_limit_area3_seconds,
      area_count: cls.area_count,
      // Get time values from their respective columns
      briefing_time: cls.briefing_time || undefined,
      break_until: cls.break_until || undefined,
      start_time: cls.start_time || undefined,
      self_checkin_enabled: cls.self_checkin_enabled ?? true, // Default to true (self check-in)
      visibility_preset: 'standard', // Will be populated below
      dogs: dogs
    };
    return classEntry;
  });

  // Sort classes by class_order first, then element, level, section
  const sortedClasses = processedClasses.sort((a, b) => {
    // Primary sort: class_order (ascending)
    if (a.class_order !== b.class_order) {
      return a.class_order - b.class_order;
    }

    // Secondary sort: element (alphabetical)
    if (a.element !== b.element) {
      return a.element.localeCompare(b.element);
    }

    // Tertiary sort: level (standard progression: Novice -> Advanced -> Excellent -> Master)
    const aLevelOrder = getLevelSortOrder(a.level);
    const bLevelOrder = getLevelSortOrder(b.level);

    if (aLevelOrder !== bLevelOrder) {
      return aLevelOrder - bLevelOrder;
    }

    // If same level order, sort alphabetically
    if (a.level !== b.level) {
      return a.level.localeCompare(b.level);
    }

    // Quaternary sort: section (alphabetical)
    return a.section.localeCompare(b.section);
  });

  // Fetch visibility presets for all classes
  try {
    const classIds = sortedClasses.map((c) => c.id);
    const { data: visibilityData } = await supabase
      .from('class_result_visibility_overrides')
      .select('class_id, preset_name')
      .in('class_id', classIds);

    // Create map of class_id to preset_name
    // CRITICAL: Use string keys to match cls.id type (prevents silent lookup failures)
    const visibilityMap = new Map<string, 'open' | 'standard' | 'review'>();
    ((visibilityData || []) as VisibilityOverride[]).forEach((override) => {
      visibilityMap.set(String(override.class_id), override.preset_name);
    });

    // Update classes with their visibility presets
    sortedClasses.forEach((cls) => {
      cls.visibility_preset = visibilityMap.get(String(cls.id)) || 'standard';
    });
  } catch (error) {
    logger.error('❌ Error fetching visibility presets:', error);
    // Continue with default 'standard' preset
  }

  return sortedClasses;
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to fetch trial information
 */
export function useTrialInfo(
  trialId: string | undefined,
  showId: string | number | undefined,
  licenseKey: string | undefined
) {
  return useQuery({
    queryKey: classListKeys.trialInfo(trialId || ''),
    queryFn: () => fetchTrialInfo(trialId, showId, licenseKey),
    enabled: !!trialId && !!showId, // Only run if both IDs are provided
    staleTime: 5 * 60 * 1000, // 5 minutes (trial info rarely changes)
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    networkMode: 'always', // Run query even offline, will use cached data
    retry: false, // Don't retry when offline
  });
}

/**
 * Hook to fetch classes with entries
 */
export function useClasses(trialId: string | undefined, licenseKey: string | undefined) {
  return useQuery({
    queryKey: classListKeys.classes(trialId || ''),
    queryFn: () => fetchClasses(trialId, licenseKey),
    enabled: !!trialId && !!licenseKey, // Only run if both are provided
    staleTime: 30 * 1000, // 30 seconds - entries can change frequently during scoring
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    networkMode: 'always', // Run query even offline, will use cached data
    retry: false, // Don't retry when offline
  });
}

// Stable empty array to prevent infinite re-renders when data is undefined
// See: ClassList.tsx useEffect syncs this to local state - new [] reference = infinite loop
const EMPTY_CLASSES: ClassEntry[] = [];

/**
 * Helper hook that combines all class list data fetching
 */
export function useClassListData(
  trialId: string | undefined,
  showId: string | number | undefined,
  licenseKey: string | undefined
) {
  const queryClient = useQueryClient();
  const trialInfoQuery = useTrialInfo(trialId, showId, licenseKey);
  const classesQuery = useClasses(trialId, licenseKey);

  // Subscribe to replication table changes to invalidate React Query cache
  // CRITICAL: This ensures UI updates when background syncAll() completes
  // Without this, React Query serves stale cached data even though IndexedDB is updated
  useEffect(() => {
    let unsubscribeClasses: (() => void) | undefined;
    let unsubscribeEntries: (() => void) | undefined;
    let isMounted = true;
    // Track if we've done the initial callback for each subscription
    // subscribe() immediately calls back with current data - we need to skip that
    let classesInitialDone = false;
    let entriesInitialDone = false;
    // Debounce invalidation to coalesce rapid notifications (leading + trailing edge)
    let invalidationTimeout: ReturnType<typeof setTimeout> | null = null;
    const INVALIDATION_DEBOUNCE_MS = 500;

    const setupSubscriptions = async () => {
      try {
        const manager = await ensureReplicationManager();
        const classesTable = manager.getTable('classes');
        const entriesTable = manager.getTable('entries');

        if (!classesTable || !entriesTable || !isMounted) return;

        // Debounced invalidation function - coalesces rapid notifications
        const debouncedInvalidate = (includeTrialInfo: boolean = false) => {
          if (!isMounted || !trialId) return;
          // Clear any pending invalidation
          if (invalidationTimeout) {
            clearTimeout(invalidationTimeout);
          }
          // Schedule invalidation after debounce period
          invalidationTimeout = setTimeout(() => {
            if (!isMounted || !trialId) return;
            logger.log('🔄 Invalidating class list queries after debounce');
            queryClient.invalidateQueries({ queryKey: classListKeys.classes(trialId) });
            if (includeTrialInfo) {
              queryClient.invalidateQueries({ queryKey: classListKeys.trialInfo(trialId) });
            }
          }, INVALIDATION_DEBOUNCE_MS);
        };

        // Subscribe to classes table changes
        unsubscribeClasses = classesTable.subscribe(() => {
          // Skip the immediate callback that subscribe() triggers
          if (!classesInitialDone) {
            classesInitialDone = true;
            return;
          }
          debouncedInvalidate(true); // Include trial info for class changes
        });

        // Subscribe to entries table changes (affects entry counts on class cards)
        unsubscribeEntries = entriesTable.subscribe(() => {
          // Skip the immediate callback that subscribe() triggers
          if (!entriesInitialDone) {
            entriesInitialDone = true;
            return;
          }
          debouncedInvalidate(false); // Only classes for entry changes
        });

        logger.log('✅ ClassList replication subscriptions ready');
      } catch (error) {
        logger.error('❌ Error setting up class list replication subscriptions:', error);
      }
    };

    setupSubscriptions();

    return () => {
      isMounted = false;
      if (invalidationTimeout) clearTimeout(invalidationTimeout);
      if (unsubscribeClasses) unsubscribeClasses();
      if (unsubscribeEntries) unsubscribeEntries();
    };
  }, [queryClient, trialId]);

  return {
    trialInfo: trialInfoQuery.data || null,
    // Use stable empty array to prevent infinite re-renders
    classes: classesQuery.data || EMPTY_CLASSES,
    isLoading: trialInfoQuery.isLoading || classesQuery.isLoading,
    isRefreshing: trialInfoQuery.isFetching || classesQuery.isFetching,
    error: trialInfoQuery.error || classesQuery.error,
    // refetch with optional forceSync to pull fresh data from server first
    refetch: async (forceSync: boolean = false) => {
      // If forceSync, sync from server before refetching from cache
      if (forceSync && licenseKey) {
        try {
          logger.log('🔄 Force sync requested - syncing classes and entries from server...');
          const manager = await ensureReplicationManager();
          await Promise.all([
            manager.syncTable('classes', { licenseKey }),
            manager.syncTable('entries', { licenseKey }),
          ]);
          logger.log('✅ Force sync complete');
        } catch (syncError) {
          // Sync failed (likely offline) - continue with cached data
          logger.warn('⚠️ Sync failed (offline?), using cached data:', syncError);
        }
      }
      // Now refetch from cache (which is now updated if sync succeeded)
      trialInfoQuery.refetch();
      classesQuery.refetch();
    },
  };
}
