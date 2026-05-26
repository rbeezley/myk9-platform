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
  class_status:
    | 'no-status'
    | 'setup'
    | 'briefing'
    | 'break'
    | 'start_time'
    | 'in_progress'
    | 'offline-scoring'
    | 'completed';
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
  pairedClassId?: number;
  self_checkin_enabled?: boolean;
  visibility_preset?: 'open' | 'standard' | 'review';
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
