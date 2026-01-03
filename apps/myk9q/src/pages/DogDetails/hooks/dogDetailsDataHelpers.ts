/**
 * Dog Details Data Helper Functions
 *
 * Extracted from useDogDetailsData.ts to reduce complexity.
 * Contains shared entry processing and mapping logic.
 */

import { getVisibleResultFields } from '../../../services/resultVisibilityService';
import type { UserRole } from '../../../utils/auth';
import type { CheckinStatus } from '../../../components/dialogs/CheckinStatusDialog';
import type { ClassEntry, DogInfo } from './useDogDetailsData';

// ============================================================================
// Types for raw entry data
// ============================================================================

export interface RawEntryData {
  id: number | string;
  class_id: number | string;
  armband_number: number;
  dog_call_name?: string | null;
  dog_breed?: string | null;
  handler_name?: string | null;
  entry_status?: string | null;
  search_time_seconds?: number | null;
  total_faults?: number | null;
  result_status?: string | null;
  is_scored?: boolean;
  final_placement?: number | null;
  // Run order field
  exhibitor_order?: number | null;
  // Optional fields from Supabase view
  element?: string | null;
  level?: string | null;
  section?: string | null;
  trial_id?: number | null;
  trial_number?: number | null;
  trial_date?: string | null;
  trial_element?: string | null;
  judge_name?: string | null;
  is_scoring_finalized?: boolean;
  results_released_at?: string | null;
}

export interface ClassData {
  id: number | string;
  element?: string | null;
  level?: string | null;
  section?: string | null;
  trial_id?: number | null;
  judge_name?: string | null;
  is_scoring_finalized?: boolean;
}

export interface TrialData {
  id: number | string;
  element?: string | null;
  trial_date?: string | null;
  trial_number?: number | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract dog info from the first entry
 */
export function extractDogInfo(entry: RawEntryData): DogInfo {
  return {
    armband: entry.armband_number,
    call_name: entry.dog_call_name || 'Unknown',
    breed: entry.dog_breed || 'Unknown',
    handler: entry.handler_name || 'Unknown'
  };
}

/**
 * Map entry status to CheckinStatus
 */
export function mapEntryStatus(statusText: string | null | undefined): CheckinStatus {
  const status = statusText || 'no-status';
  return status === 'in-ring' ? 'no-status' : status as CheckinStatus;
}

/**
 * Parse ID to number (handles string IDs from different sources)
 */
function parseId(id: number | string): number {
  return typeof id === 'string' ? parseInt(id) : id;
}

/**
 * Derived field values from entry, class, and trial data
 */
interface DerivedFields {
  element: string;
  level: string;
  section: string | null | undefined;
  trialId: number;
  trialNumber: number | undefined;
  isCompleted: boolean;
  resultsReleasedAt: string | null;
  judgeName: string | undefined;
  trialName: string;
  trialDate: string;
}

/**
 * Extract derived fields with fallbacks between entry, class, and trial data
 */
function extractDerivedFields(
  entry: RawEntryData,
  classData?: ClassData,
  trialData?: TrialData
): DerivedFields {
  return {
    element: entry.element || classData?.element || 'Unknown',
    level: entry.level || classData?.level || 'Class',
    section: entry.section || classData?.section,
    trialId: entry.trial_id || classData?.trial_id || 0,
    trialNumber: entry.trial_number ?? trialData?.trial_number ?? undefined,
    isCompleted: entry.is_scoring_finalized ?? classData?.is_scoring_finalized ?? false,
    resultsReleasedAt: entry.results_released_at ?? null,
    judgeName: entry.judge_name || classData?.judge_name || undefined,
    trialName: entry.trial_element || trialData?.element || 'Unknown Trial',
    trialDate: entry.trial_date || trialData?.trial_date || ''
  };
}

/**
 * Build ClassEntry object from entry data and derived fields
 */
function buildClassEntry(
  entry: RawEntryData,
  fields: DerivedFields,
  checkInStatus: CheckinStatus,
  visibleFields: ClassEntry['visibleFields'],
  queuePosition?: number
): ClassEntry {
  return {
    id: parseId(entry.id),
    class_id: parseId(entry.class_id),
    class_name: fields.element && fields.level ? `${fields.element} ${fields.level}` : 'Unknown Class',
    class_type: fields.element,
    trial_name: fields.trialName,
    trial_date: fields.trialDate,
    search_time: entry.search_time_seconds ? `${entry.search_time_seconds}s` : null,
    fault_count: entry.total_faults || null,
    result_text: entry.result_status || null,
    is_scored: entry.is_scored || false,
    checked_in: checkInStatus !== 'no-status',
    check_in_status: checkInStatus,
    position: entry.final_placement ?? undefined,
    element: fields.element,
    level: fields.level,
    section: fields.section ?? undefined,
    trial_number: fields.trialNumber,
    judge_name: fields.judgeName,
    trial_id: fields.trialId,
    is_scoring_finalized: fields.isCompleted,
    results_released_at: fields.resultsReleasedAt,
    visibleFields,
    queuePosition
  };
}

/**
 * Calculate queue position for an entry within its class.
 * Returns the number of dogs ahead in the queue (0 = next up).
 *
 * Queue logic:
 * - Only counts pending entries (not scored)
 * - Excludes pulled entries from count
 * - Sorts by exhibitor_order (run order)
 * - Prioritizes in-ring entries (they're running, so 0 ahead for them)
 */
export function calculateQueuePosition(
  entry: RawEntryData,
  allEntries: RawEntryData[]
): number | undefined {
  // Skip if entry is already scored - no queue position needed
  if (entry.is_scored) {
    return undefined;
  }

  // Get all entries for this class
  const classId = String(entry.class_id);
  const classEntries = allEntries.filter(e => String(e.class_id) === classId);

  // Filter to only pending entries (not scored, not pulled)
  const pendingEntries = classEntries.filter(e =>
    !e.is_scored &&
    e.entry_status !== 'pulled'
  );

  // Sort by exhibitor_order (ascending), with in-ring entries first
  const sortedEntries = [...pendingEntries].sort((a, b) => {
    // In-ring entries always first
    const aIsInRing = a.entry_status === 'in-ring';
    const bIsInRing = b.entry_status === 'in-ring';
    if (aIsInRing && !bIsInRing) return -1;
    if (!aIsInRing && bIsInRing) return 1;

    // Then by exhibitor_order (treat 0 as "not set" and fall back to armband)
    // This handles classes where run order was never rearranged (all exhibitor_order = 0)
    const aOrder = (a.exhibitor_order && a.exhibitor_order > 0) ? a.exhibitor_order : (a.armband_number ?? 9999);
    const bOrder = (b.exhibitor_order && b.exhibitor_order > 0) ? b.exhibitor_order : (b.armband_number ?? 9999);
    return aOrder - bOrder;
  });

  // Find this entry's position in the sorted list
  const entryId = String(entry.id);
  const position = sortedEntries.findIndex(e => String(e.id) === entryId);

  // Return the number of dogs ahead (position is 0-indexed)
  return position >= 0 ? position : undefined;
}

/**
 * Process a single entry into a ClassEntry with visibility settings
 */
export async function processEntryToClassEntry(
  entry: RawEntryData,
  licenseKey: string,
  currentRole: UserRole | null | undefined,
  classData?: ClassData,
  trialData?: TrialData,
  allEntries?: RawEntryData[]
): Promise<ClassEntry> {
  const checkInStatus = mapEntryStatus(entry.entry_status);
  const fields = extractDerivedFields(entry, classData, trialData);

  // Fetch visibility settings for this class (role-based)
  const visibleFields = await getVisibleResultFields({
    classId: parseId(entry.class_id),
    trialId: fields.trialId,
    licenseKey,
    userRole: (currentRole || 'exhibitor') as UserRole,
    isClassComplete: fields.isCompleted,
    resultsReleasedAt: fields.resultsReleasedAt
  });

  // Calculate queue position if we have all entries
  const queuePosition = allEntries ? calculateQueuePosition(entry, allEntries) : undefined;

  return buildClassEntry(entry, fields, checkInStatus, visibleFields, queuePosition);
}

/**
 * Process multiple entries into ClassEntries with visibility settings
 */
export async function processEntriesToClassEntries(
  entries: RawEntryData[],
  licenseKey: string,
  currentRole: UserRole | null | undefined,
  classMap?: Map<string, ClassData>,
  trialMap?: Map<string, TrialData>,
  allEntries?: RawEntryData[]
): Promise<ClassEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const classData = classMap?.get(String(entry.class_id));
      const trialData = classData && trialMap ? trialMap.get(String(classData.trial_id)) : undefined;
      return processEntryToClassEntry(entry, licenseKey, currentRole, classData, trialData, allEntries);
    })
  );
}
