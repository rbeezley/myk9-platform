/**
 * Shared data shapes for the ClassList page surface.
 *
 * Lifted from `apps/myk9q/src/pages/ClassList/hooks/useClassListFetch.ts`
 * during PR E0 so page helpers in `@myk9/ringside` can describe their
 * inputs without importing from a non-package file.
 *
 * The host's data-fetching code (e.g. `useClassListFetch` in apps/myk9q)
 * re-exports these types — there is a single source of truth here.
 *
 * Note: at least three other files in apps/myk9q define a type also
 * named `ClassEntry` (statusUtils, classFilterUtils, useDogDetailsData)
 * with different shapes for different concerns. Those are intentionally
 * NOT consolidated here — they describe distinct views, not duplicates
 * of this fetched-class shape.
 */

/**
 * Persisted class-status values. Lifted to its own named type so the
 * Q5 DI surface (`RingsideReplication.updateClassStatus`) and this
 * data shape stay in sync — extending in one place updates both.
 */
export type ClassStatusValue =
  | 'no-status'
  | 'setup'
  | 'briefing'
  | 'break'
  | 'start_time'
  | 'in_progress'
  | 'offline-scoring'
  | 'completed';

export interface ClassEntry {
  id: string;
  element: string;
  level: string;
  section: string;
  class_name: string;
  class_order: number;
  judge_name: string;
  entry_count: number;
  completed_count: number;
  class_status: ClassStatusValue;
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
  last_result_at?: string;
  pairedClassId?: string;
  self_checkin_enabled?: boolean;
  visibility_preset?: 'open' | 'standard' | 'review';
  dogs: {
    id: string;
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

// ── UI/display state types (merged from apps/myk9q ClassList.types.ts in PR E1a) ──

/** Sort order for class list display */
export type SortOrder = 'class_order' | 'element_level' | 'level_element';

/** Combined filter for class list tabs */
export type CombinedFilter = 'pending' | 'in-progress' | 'favorites' | 'completed';

/** State for the print dialog (which report type and which class) */
export interface PrintDialogState {
  type: 'check-in' | 'results' | 'scoresheet' | null;
  classId: string | null;
}

/** Sort option for the FilterPanel */
export interface SortOption {
  value: SortOrder;
  label: string;
}

/** Predefined sort options for the FilterPanel */
export const SORT_OPTIONS: SortOption[] = [
  { value: 'class_order', label: 'Run Order' },
  { value: 'element_level', label: 'Element → Level' },
  { value: 'level_element', label: 'Level → Element' },
];
