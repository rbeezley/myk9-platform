/**
 * useEntryListData Helper Functions
 *
 * Extracted from useEntryListData.ts (DEBT-008) to reduce complexity.
 * Contains data fetching logic for single and combined class views.
 */

import { getClassEntries } from '../../../services/entryService';
import { Entry } from '../../../stores/entryStore';
import { supabase } from '../../../lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import type { Entry as ReplicatedEntry } from '@/services/replication/tables/ReplicatedEntriesTable';
import type { Trial } from '@/services/replication/tables/ReplicatedTrialsTable';
import { logger } from '@/utils/logger';
import { getVisibleResultFields } from '@/services/resultVisibilityService';
import type { VisibleResultFields } from '@/types/visibility';
import type { UserRole } from '@/utils/auth';
import { getAreaCountForClass } from '@/utils/classUtils';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate area count with fallback logic.
 * Uses stored value if available, otherwise derives from element/level.
 */
function calcAreaCount(storedValue: number | undefined | null, element?: string, level?: string): number {
  if (storedValue) return storedValue;
  if (element && level) return getAreaCountForClass(element, level);
  return 1;
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface ClassInfo {
  className: string;
  element: string;
  level: string;
  section?: string;
  trialId?: number;
  trialDate?: string;
  trialNumber?: string;
  judgeName?: string;
  judgeNameB?: string;
  actualClassId?: number;
  actualClassIdA?: number;
  actualClassIdB?: number;
  selfCheckin?: boolean;
  classStatus?: string;
  totalEntries?: number;
  completedEntries?: number;
  timeLimit?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  areas?: number;
  visibilityPreset?: 'open' | 'standard' | 'review';
}

export interface EntryListData {
  entries: Entry[];
  classInfo: ClassInfo | null;
}

// =============================================================================
// VISIBILITY HELPERS
// =============================================================================

/** Context for visibility flag lookups - grouped to reduce parameter count */
export interface VisibilityContext {
  classId: number;
  trialId: number;
  licenseKey: string;
  role: UserRole;
  isClassComplete: boolean;
  resultsReleasedAt: string | null;
}

/** Default visibility flags - used when fetch fails (fail-open for better UX) */
const DEFAULT_VISIBILITY_FLAGS: VisibleResultFields = {
  showPlacement: true,
  showQualification: true,
  showTime: true,
  showFaults: true
};

/**
 * Apply visibility flags to an entry based on visibility settings
 */
export function applyVisibilityFlags(entry: Entry, visibilityFlags: VisibleResultFields): Entry {
  return {
    ...entry,
    showPlacement: visibilityFlags.showPlacement,
    showQualification: visibilityFlags.showQualification,
    showTime: visibilityFlags.showTime,
    showFaults: visibilityFlags.showFaults
  };
}

/**
 * Fetch visibility flags with error handling - returns defaults on failure
 */
export async function fetchVisibilityFlagsWithFallback(
  ctx: VisibilityContext
): Promise<VisibleResultFields> {
  try {
    // Pass context directly - service now accepts VisibilityEvaluationContext
    return await getVisibleResultFields({
      classId: ctx.classId,
      trialId: ctx.trialId,
      licenseKey: ctx.licenseKey,
      userRole: ctx.role,
      isClassComplete: ctx.isClassComplete,
      resultsReleasedAt: ctx.resultsReleasedAt
    });
  } catch (error) {
    logger.error('❌ Error fetching visibility settings, defaulting to show all:', error);
    return DEFAULT_VISIBILITY_FLAGS;
  }
}

/**
 * Apply visibility to entries - handles both single and combined class cases
 */
export async function applyVisibilityToEntries(
  entries: Entry[],
  classData: Class,
  licenseKey: string,
  role: UserRole
): Promise<Entry[]> {
  const isClassComplete = classData.class_status === 'completed' || classData.is_scoring_finalized === true;
  const visibilityFlags = await fetchVisibilityFlagsWithFallback({
    classId: parseInt(String(classData.id)),
    trialId: classData.trial_id,
    licenseKey,
    role,
    isClassComplete,
    resultsReleasedAt: classData.results_released_at || null
  });
  return entries.map(entry => applyVisibilityFlags(entry, visibilityFlags));
}

/**
 * Fetch visibility preset for a class from class_result_visibility_overrides table
 */
export async function fetchVisibilityPreset(
  classId: number | string
): Promise<'open' | 'standard' | 'review'> {
  try {
    // Use maybeSingle() to avoid 406 error when no row exists for this class
    const { data } = await supabase
      .from('class_result_visibility_overrides')
      .select('class_id, preset_name')
      .eq('class_id', parseInt(String(classId)))
      .maybeSingle();

    if (data?.preset_name && ['open', 'standard', 'review'].includes(data.preset_name)) {
      return data.preset_name as 'open' | 'standard' | 'review';
    }
  } catch {
    // Table might not have a row for this class - default to 'standard'
  }
  return 'standard';
}

// =============================================================================
// CLASS INFO BUILDERS
// =============================================================================

/**
 * Build ClassInfo from class data - single class version
 */
export function buildSingleClassInfo(
  classData: Class,
  classId: string,
  entries: Entry[],
  judgeName: string,
  trialData?: Trial | null,
  visibilityPreset?: 'open' | 'standard' | 'review'
): ClassInfo {
  const sectionPart = classData.section && classData.section !== '-' ? ` ${classData.section}` : '';
  const completedEntries = entries.filter(e => e.isScored).length;

  const areaCount = calcAreaCount(classData.area_count, classData.element, classData.level);

  return {
    className: `${classData.element} ${classData.level}${sectionPart}`.trim(),
    element: classData.element || '',
    level: classData.level || '',
    section: classData.section || '',
    trialId: classData.trial_id,
    trialDate: trialData?.trial_date || entries[0]?.trialDate || '',
    trialNumber: trialData?.trial_number ? String(trialData.trial_number) : (entries[0]?.trialNumber ? String(entries[0].trialNumber) : ''),
    judgeName,
    actualClassId: parseInt(classId),
    selfCheckin: classData.self_checkin_enabled ?? true,
    classStatus: classData.class_status || 'pending',
    totalEntries: entries.length,
    completedEntries,
    timeLimit: classData.time_limit_seconds ? `${classData.time_limit_seconds}s` : undefined,
    timeLimit2: classData.time_limit_area2_seconds ? `${classData.time_limit_area2_seconds}s` : undefined,
    timeLimit3: classData.time_limit_area3_seconds ? `${classData.time_limit_area3_seconds}s` : undefined,
    areas: areaCount,
    visibilityPreset: visibilityPreset || 'standard'
  };
}

/**
 * Build ClassInfo from class data - combined A & B version
 */
export function buildCombinedClassInfo(
  classDataA: Class,
  classDataB: Class,
  classIdA: string,
  classIdB: string,
  entries: Entry[],
  trialData?: Trial | null,
  visibilityPreset?: 'open' | 'standard' | 'review'
): ClassInfo {
  const areaCount = calcAreaCount(classDataA.area_count, classDataA.element, classDataA.level);

  return {
    className: `${classDataA.element} ${classDataA.level} A & B`,
    element: classDataA.element || '',
    level: classDataA.level || '',
    trialId: classDataA.trial_id,
    trialDate: trialData?.trial_date || entries[0]?.trialDate || '',
    trialNumber: trialData?.trial_number ? String(trialData.trial_number) : (entries[0]?.trialNumber ? String(entries[0].trialNumber) : ''),
    judgeName: classDataA.judge_name || 'No Judge Assigned',
    judgeNameB: classDataB.judge_name || 'No Judge Assigned',
    actualClassIdA: parseInt(classIdA),
    actualClassIdB: parseInt(classIdB),
    selfCheckin: classDataA.self_checkin_enabled ?? true,
    classStatus: classDataA.class_status || classDataB.class_status || 'pending',
    timeLimit: classDataA.time_limit_seconds ? `${classDataA.time_limit_seconds}s` : undefined,
    timeLimit2: classDataA.time_limit_area2_seconds ? `${classDataA.time_limit_area2_seconds}s` : undefined,
    timeLimit3: classDataA.time_limit_area3_seconds ? `${classDataA.time_limit_area3_seconds}s` : undefined,
    areas: areaCount,
    visibilityPreset: visibilityPreset || 'standard'
  };
}

// =============================================================================
// ENTRY TRANSFORMATION
// =============================================================================

/**
 * Transform replicated entry to Entry format
 */
export function transformReplicatedEntry(entry: ReplicatedEntry, classData?: Class): Entry {
  const status = entry.entry_status || 'pending';
  const sectionPart = classData?.section && classData.section !== '-' ? ` ${classData.section}` : '';

  return {
    id: parseInt(entry.id, 10),
    armband: entry.armband_number,
    callName: entry.dog_call_name,
    breed: entry.dog_breed || '',
    handler: entry.handler_name,
    isScored: entry.is_scored || false,
    status: status as Entry['status'],
    inRing: entry.entry_status === 'in-ring',
    classId: parseInt(entry.class_id, 10),
    className: classData?.element && classData?.level
      ? `${classData.element} ${classData.level}${sectionPart}`.trim()
      : '',
    element: classData?.element || '',
    level: classData?.level || '',
    section: classData?.section || '',
    timeLimit: classData?.time_limit_seconds ? `${classData.time_limit_seconds}s` : undefined,
    timeLimit2: classData?.time_limit_area2_seconds ? `${classData.time_limit_area2_seconds}s` : undefined,
    timeLimit3: classData?.time_limit_area3_seconds ? `${classData.time_limit_area3_seconds}s` : undefined,
    resultText: entry.result_status,
    placement: entry.final_placement,
    searchTime: entry.search_time_seconds?.toString(),
    faultCount: entry.total_faults,
    exhibitorOrder: entry.exhibitor_order,
  };
}

// =============================================================================
// SINGLE CLASS FETCH FUNCTIONS
// =============================================================================

/**
 * Fetch single class entries from replication cache
 */
export async function fetchFromReplicationCache(
  classId: string,
  licenseKey: string,
  userRole: UserRole
): Promise<EntryListData | null> {
  try {
    const manager = await ensureReplicationManager();
    const classesTable = manager.getTable<Class>('classes');
    const entriesTable = manager.getTable<ReplicatedEntry>('entries');
    const trialsTable = manager.getTable<Trial>('trials');

    if (!classesTable || !entriesTable) return null;

    const classData = await classesTable.get(classId);
    if (!classData) return null;

    // Fetch trial data for date/number display
    let trialData: Trial | null = null;
    if (trialsTable && classData.trial_id) {
      trialData = await trialsTable.get(String(classData.trial_id)) || null;
    }

    const cachedEntries = await entriesTable.getAll();
    const relevantEntries = cachedEntries.filter((entry) => String(entry.class_id) === classId);

    let classEntries = relevantEntries.map((entry) => transformReplicatedEntry(entry, classData));

    // Fetch visibility preset for class settings display
    const visibilityPreset = await fetchVisibilityPreset(classId);

    // Build classInfo even if entries are empty
    const classInfo = buildSingleClassInfo(
      classData,
      classId,
      classEntries,
      classData.judge_name || 'No Judge Assigned',
      trialData,
      visibilityPreset
    );

    if (classEntries.length === 0) {
      logger.log('📭 Class exists but has no entries in cache');
      return { entries: [], classInfo };
    }

    // Apply visibility for non-empty entries
    classEntries = await applyVisibilityToEntries(classEntries, classData, licenseKey, userRole);

    return { entries: classEntries, classInfo };
  } catch (error) {
    logger.error('❌ Error loading from replicated cache, falling back to Supabase:', error);
    return null;
  }
}

/**
 * Fetch single class entries from Supabase (fallback)
 */
export async function fetchFromSupabase(
  classId: string,
  licenseKey: string,
  userRole: UserRole
): Promise<EntryListData> {
  let classEntries = await getClassEntries(parseInt(classId), licenseKey);

  const { data: classData } = await supabase
    .from('classes')
    .select('element, level, section, judge_name, self_checkin_enabled, class_status, trial_id, is_scoring_finalized, results_released_at, time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds, area_count')
    .eq('id', parseInt(classId))
    .single();

  if (!classData) {
    return { entries: [], classInfo: null };
  }

  // Fetch trial data for date/number display
  let trialDate = classEntries[0]?.trialDate || '';
  let trialNumber = classEntries[0]?.trialNumber ? String(classEntries[0].trialNumber) : '';

  if (classData.trial_id && (!trialDate || !trialNumber)) {
    const { data: trialData } = await supabase
      .from('trials')
      .select('trial_date, trial_number')
      .eq('id', classData.trial_id)
      .single();

    if (trialData) {
      trialDate = trialData.trial_date || trialDate;
      trialNumber = trialData.trial_number ? String(trialData.trial_number) : trialNumber;
    }
  }

  const sectionPart = classData.section && classData.section !== '-' ? ` ${classData.section}` : '';
  const completedEntries = classEntries.filter(e => e.isScored).length;

  // Fetch visibility preset for class settings display
  const visibilityPreset = await fetchVisibilityPreset(classId);

  const areaCount = calcAreaCount(classData.area_count, classData.element, classData.level);

  const classInfo: ClassInfo = {
    className: `${classData.element} ${classData.level}${sectionPart}`.trim(),
    element: classData.element || '',
    level: classData.level || '',
    section: classData.section || '',
    trialId: classData.trial_id,
    trialDate,
    trialNumber,
    judgeName: classData.judge_name || 'No Judge Assigned',
    actualClassId: parseInt(classId),
    selfCheckin: classData.self_checkin_enabled ?? true,
    classStatus: classData.class_status || 'pending',
    totalEntries: classEntries.length,
    completedEntries,
    timeLimit: classData.time_limit_seconds ? `${classData.time_limit_seconds}s` : undefined,
    timeLimit2: classData.time_limit_area2_seconds ? `${classData.time_limit_area2_seconds}s` : undefined,
    timeLimit3: classData.time_limit_area3_seconds ? `${classData.time_limit_area3_seconds}s` : undefined,
    areas: areaCount,
    visibilityPreset
  };

  if (classEntries.length === 0) {
    return { entries: [], classInfo };
  }

  const visibilityFlags = await fetchVisibilityFlagsWithFallback({
    classId: parseInt(classId),
    trialId: classData.trial_id,
    licenseKey,
    role: userRole,
    isClassComplete: classData.class_status === 'completed' || classData.is_scoring_finalized === true,
    resultsReleasedAt: classData.results_released_at || null
  });
  classEntries = classEntries.map(entry => applyVisibilityFlags(entry, visibilityFlags));

  return { entries: classEntries, classInfo };
}

// =============================================================================
// COMBINED CLASS FETCH FUNCTIONS
// =============================================================================

/**
 * Fetch combined class entries from replication cache
 */
export async function fetchCombinedFromReplicationCache(
  classIdA: string,
  classIdB: string,
  licenseKey: string,
  userRole: UserRole
): Promise<EntryListData | null> {
  try {
    const manager = await ensureReplicationManager();
    const classesTable = manager.getTable<Class>('classes');
    const entriesTable = manager.getTable<ReplicatedEntry>('entries');
    const trialsTable = manager.getTable<Trial>('trials');

    if (!classesTable || !entriesTable) return null;

    const classDataA = await classesTable.get(classIdA);
    const classDataB = await classesTable.get(classIdB);

    if (!classDataA || !classDataB) return null;

    // Fetch trial data for date/number display (use class A's trial)
    let trialData: Trial | null = null;
    if (trialsTable && classDataA.trial_id) {
      trialData = await trialsTable.get(String(classDataA.trial_id)) || null;
    }

    const cachedEntries = await entriesTable.getAll();

    const rawEntriesA = cachedEntries.filter((entry) => String(entry.class_id) === classIdA);
    const rawEntriesB = cachedEntries.filter((entry) => String(entry.class_id) === classIdB);

    let entriesA = rawEntriesA.map((entry) => transformReplicatedEntry(entry, classDataA));
    let entriesB = rawEntriesB.map((entry) => transformReplicatedEntry(entry, classDataB));

    if (entriesA.length === 0 && entriesB.length === 0) {
      logger.log('📭 Cache is empty, falling back to Supabase');
      return null;
    }

    entriesA = await applyVisibilityToEntries(entriesA, classDataA, licenseKey, userRole);
    entriesB = await applyVisibilityToEntries(entriesB, classDataB, licenseKey, userRole);

    // Fetch visibility preset (use class A's setting for combined view)
    const visibilityPreset = await fetchVisibilityPreset(classIdA);

    const combinedEntries = [...entriesA, ...entriesB];
    const classInfo = buildCombinedClassInfo(classDataA, classDataB, classIdA, classIdB, combinedEntries, trialData, visibilityPreset);

    return { entries: combinedEntries, classInfo };
  } catch (error) {
    logger.error('❌ Error loading from replicated cache, falling back to Supabase:', error);
    return null;
  }
}

/**
 * Fetch combined class entries from Supabase (fallback)
 */
export async function fetchCombinedFromSupabase(
  classIdA: string,
  classIdB: string,
  licenseKey: string,
  userRole: UserRole
): Promise<EntryListData> {
  const classIdsArray = [parseInt(classIdA), parseInt(classIdB)];
  let combinedEntries = await getClassEntries(classIdsArray, licenseKey);

  if (combinedEntries.length === 0) {
    return { entries: [], classInfo: null };
  }

  const firstEntry = combinedEntries[0];

  const [{ data: classDataA }, { data: classDataB }] = await Promise.all([
    supabase.from('classes')
      .select('judge_name, self_checkin_enabled, class_status, trial_id, is_scoring_finalized, results_released_at')
      .eq('id', parseInt(classIdA))
      .single(),
    supabase.from('classes')
      .select('judge_name, class_status, trial_id, is_scoring_finalized, results_released_at')
      .eq('id', parseInt(classIdB))
      .single()
  ]);

  // Fetch trial data for date/number display
  let trialDate = firstEntry.trialDate || '';
  let trialNumber = firstEntry.trialNumber ? String(firstEntry.trialNumber) : '';

  if (classDataA?.trial_id && (!trialDate || !trialNumber)) {
    const { data: trialData } = await supabase
      .from('trials')
      .select('trial_date, trial_number')
      .eq('id', classDataA.trial_id)
      .single();

    if (trialData) {
      trialDate = trialData.trial_date || trialDate;
      trialNumber = trialData.trial_number ? String(trialData.trial_number) : trialNumber;
    }
  }

  if (classDataA && classDataB) {
    const entriesA = combinedEntries.filter(e => e.classId === parseInt(classIdA));
    const entriesB = combinedEntries.filter(e => e.classId === parseInt(classIdB));

    const [visibilityFlagsA, visibilityFlagsB] = await Promise.all([
      fetchVisibilityFlagsWithFallback({
        classId: parseInt(classIdA),
        trialId: classDataA.trial_id,
        licenseKey,
        role: userRole,
        isClassComplete: classDataA.class_status === 'completed' || classDataA.is_scoring_finalized === true,
        resultsReleasedAt: classDataA.results_released_at || null
      }),
      fetchVisibilityFlagsWithFallback({
        classId: parseInt(classIdB),
        trialId: classDataB.trial_id,
        licenseKey,
        role: userRole,
        isClassComplete: classDataB.class_status === 'completed' || classDataB.is_scoring_finalized === true,
        resultsReleasedAt: classDataB.results_released_at || null
      })
    ]);

    const processedA = entriesA.map(entry => applyVisibilityFlags(entry, visibilityFlagsA));
    const processedB = entriesB.map(entry => applyVisibilityFlags(entry, visibilityFlagsB));
    combinedEntries = [...processedA, ...processedB];
  }

  // Fetch visibility preset (use class A's setting for combined view)
  const visibilityPreset = await fetchVisibilityPreset(classIdA);

  const areaCount = calcAreaCount(firstEntry.areas, firstEntry.element, firstEntry.level);

  const classInfo: ClassInfo = {
    className: `${firstEntry.element} ${firstEntry.level} A & B`,
    element: firstEntry.element || '',
    level: firstEntry.level || '',
    trialId: classDataA?.trial_id,
    trialDate,
    trialNumber,
    judgeName: classDataA?.judge_name || 'No Judge Assigned',
    judgeNameB: classDataB?.judge_name || 'No Judge Assigned',
    actualClassIdA: parseInt(classIdA),
    actualClassIdB: parseInt(classIdB),
    selfCheckin: classDataA?.self_checkin_enabled ?? true,
    classStatus: classDataA?.class_status || classDataB?.class_status || 'pending',
    timeLimit: firstEntry.timeLimit,
    timeLimit2: firstEntry.timeLimit2,
    timeLimit3: firstEntry.timeLimit3,
    areas: areaCount,
    visibilityPreset
  };

  return { entries: combinedEntries, classInfo };
}
