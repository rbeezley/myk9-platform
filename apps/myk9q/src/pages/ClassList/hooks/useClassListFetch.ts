import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { getClassEntries } from '../../../services/entryService';
import { getLevelSortOrder } from '../../../lib/utils';
import { logger } from '../../../utils/logger';
import { prefetchCache } from '@/services/replication/PrefetchCacheManager';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import { getClassSortKey } from '@/services/replication/tables/ReplicatedClassesTable';
import type { Entry } from '@/services/replication/tables/ReplicatedEntriesTable';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface CachedTrialData {
  trial_name: string;
  trial_date: string;
  trial_number?: number;
  trialid?: number;
}

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

interface VisibilityOverride {
  class_id: number;
  preset: 'open' | 'standard' | 'review';
}

// ClassEntry / TrialInfo / ClassListData type definitions moved to
// @myk9/ringside in PR E0 (see packages/ringside/src/pages/ClassList/types.ts).
// Imported for local use AND re-exported so legacy import paths
// (`from './useClassListFetch'`, `from './useClassListData'`) keep
// working unchanged.
import type {
  ClassEntry,
  TrialInfo,
  ClassListData,
} from '@myk9/ringside';
export type { ClassEntry, TrialInfo, ClassListData };

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
          pending_classes: classData.filter(c => c.is_scoring_finalized !== true).length || 0,
          completed_classes: classData.filter(c => c.is_scoring_finalized === true).length || 0,
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
    completed_classes: classData?.filter(c => c.is_scoring_finalized === true).length || 0,
  };

  return trialInfo;
}

async function processClassesWithEntries(
  classesData: Class[],
  entriesData: Entry[],
  _licenseKey: string
): Promise<ClassEntry[]> {
  // Build a map of classId -> entries
  // CRITICAL: Normalize all IDs to strings to prevent type mismatch (number vs string)
  const entriesByClass = new Map<string, Entry[]>();

  entriesData.forEach(entry => {
    const classId = String(entry.class_id); // Normalize to string
    if (!entriesByClass.has(classId)) {
      entriesByClass.set(classId, []);
    }
    entriesByClass.get(classId)!.push(entry);
  });

  // Process each class
  const processedClasses = classesData.map(cls => {
    const classEntries = entriesByClass.get(String(cls.id)) || []; // Normalize to string

    // Process dog entries with custom status priority sorting
    const dogs = classEntries
      .map(entry => ({
        id: entry.id,
        armband: entry.armband,
        call_name: entry.dog_call_name,
        breed: entry.dog_breed || '',
        handler: entry.handler,
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
        exhibitor_order: entry.run_order || 0,
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
    const completedCount = dogs.filter(dog => dog.is_scored).length;

    // Construct class name from element, level, and section
    const sectionPart = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
    const className = `${cls.element} ${cls.level}${sectionPart}`.trim();

    return {
      id: cls.id,
      element: cls.element,
      level: cls.level,
      section: cls.section || '',
      class_name: className,
      // Canonical secretary-controlled order is `display_order` (migration 136).
      // `class_order` is the legacy alias exposed by `view_class_summary` only,
      // so the replicated path must prefer display_order or myK9Show reorders
      // won't reach ringside.
      class_order: (() => {
        const key = getClassSortKey(cls);
        return key === Number.MAX_SAFE_INTEGER ? 999 : key;
      })(),
      judge_name: cls.judge_name || 'TBA',
      entry_count: entryCount,
      completed_count: completedCount,
      class_status: (cls.status?.trim() || 'no-status') as
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
      // Per-area time limits exist on the classes table but are not exposed by
      // view_myk9q_entries. myK9Q uses a single time_limit_seconds for all areas.
      time_limit_area2_seconds: undefined,
      time_limit_area3_seconds: undefined,
      area_count: cls.num_areas,
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

async function applyVisibilityPresets(classes: ClassEntry[]): Promise<void> {
  if (classes.length === 0) return;

  try {
    const classIds = classes.map(c => c.id);
    const { data: visibilityData } = await supabase
      .from('class_visibility_overrides')
      .select('class_id, preset')
      .in('class_id', classIds);

    // CRITICAL: Use string keys to match cls.id type (prevents silent lookup failures)
    const visibilityMap = new Map<string, 'open' | 'standard' | 'review'>();
    ((visibilityData || []) as VisibilityOverride[]).forEach(override => {
      visibilityMap.set(String(override.class_id), override.preset);
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
  const trialClasses = cachedClasses.filter(cls => cls.trial_id === trialIdNum);

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
  const processedClasses = await processClassesWithEntries(trialClasses, cachedEntries, licenseKey);

  // Fetch and apply visibility presets
  await applyVisibilityPresets(processedClasses);

  return processedClasses;
}

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
  const classIds = classData.map(c => c.class_id);
  const allTrialEntries = await getClassEntries(classIds, licenseKey);

  // Process classes with entry data
  const processedClasses = classData.map(cls => {
    // Filter entries for this specific class using class_id
    const entryData = allTrialEntries.filter(entry => entry.classId === String(cls.class_id));

    // Process dog entries with custom status priority sorting
    const dogs = entryData
      .map(entry => ({
        id: entry.id,
        armband: entry.armband,
        call_name: entry.callName,
        breed: entry.breed,
        handler: entry.handler,
        in_ring: entry.status === 'in-ring',
        checkin_status:
          entry.status === 'checked-in'
            ? 1
            : entry.status === 'conflict'
              ? 2
              : entry.status === 'pulled'
                ? 3
                : entry.status === 'at-gate'
                  ? 4
                  : 0,
        is_scored: entry.isScored,
        exhibitor_order: entry.exhibitorOrder || 0,
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
    const completedCount = dogs.filter(dog => dog.is_scored).length;

    // Construct class name from element, level, and section (hide section if it's a dash)
    const sectionPart = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
    const className = `${cls.element} ${cls.level}${sectionPart}`.trim();

    const classEntry: ClassEntry = {
      id: String(cls.class_id),
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
      dogs: dogs,
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
    const classIds = sortedClasses.map(c => c.id);
    const { data: visibilityData } = await supabase
      .from('class_visibility_overrides')
      .select('class_id, preset')
      .in('class_id', classIds);

    // Create map of class_id to preset
    // CRITICAL: Use string keys to match cls.id type (prevents silent lookup failures)
    const visibilityMap = new Map<string, 'open' | 'standard' | 'review'>();
    ((visibilityData || []) as VisibilityOverride[]).forEach(override => {
      visibilityMap.set(String(override.class_id), override.preset);
    });

    // Update classes with their visibility presets
    sortedClasses.forEach(cls => {
      cls.visibility_preset = visibilityMap.get(String(cls.id)) || 'standard';
    });
  } catch (error) {
    logger.error('❌ Error fetching visibility presets:', error);
    // Continue with default 'standard' preset
  }

  return sortedClasses;
}

// ============================================================
// QUERY HOOKS
// ============================================================

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
