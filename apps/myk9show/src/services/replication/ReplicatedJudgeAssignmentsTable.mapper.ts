/**
 * Row shapes and the row mapper for ReplicatedJudgeAssignmentsTable, kept in a
 * sibling module so the table stays within the source-size budget.
 */

import type { Database } from '@/types/supabase';

type JudgeAssignmentRow = Database['public']['Tables']['judge_assignments']['Row'];

/**
 * Denormalized class/trial snapshot embedded at sync time. judge_assignments
 * syncs globally while classes/trials sync per-show, so the assignment row must
 * carry its own class/trial detail to drive the judge dashboard offline across
 * shows the judge hasn't entered. These are read-only enrichment fields: they
 * are NOT written back in toSupabaseRow (no such columns exist on the table).
 */
export interface JudgeAssignmentEnrichment {
  className: string | null;
  classElement: string | null;
  classLevel: string | null;
  classStatus: string | null;
  classStartTime: string | null;
  classCheckedInCount: number | null;
  classScoredCount: number | null;
  classTotalEntries: number | null;
  trialDate: string | null;
  trialTimezone: string | null;
}

export interface ReplicatedJudgeAssignment extends JudgeAssignmentEnrichment {
  id: string;
  personId: string;
  showId: string | null;
  trialId: string | null;
  classId: string | null;
  status: string | null;
  invitedAt: string | null;
  confirmedAt: string | null;
  fee: number | null;
  notes: string | null;
  dayCapacityOverride?: number | null | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/** Shape returned by the enriched sync select (judge_assignments + classes + trials). */
export type JudgeAssignmentJoinedRow = JudgeAssignmentRow & {
  classes?: {
    name: string | null;
    element: string | null;
    level: string | null;
    status: string | null;
    start_time: string | null;
    scored_count: number | null;
    checked_in_count: number | null;
    total_entries_count: number | null;
    trial_id: string | null;
    trials?: {
      date: string | null;
      timezone: string | null;
      show_id: string | null;
    } | null;
  } | null;
};

export const EMPTY_ENRICHMENT: JudgeAssignmentEnrichment = {
  className: null,
  classElement: null,
  classLevel: null,
  classStatus: null,
  classStartTime: null,
  classCheckedInCount: null,
  classScoredCount: null,
  classTotalEntries: null,
  trialDate: null,
  trialTimezone: null,
};

export function rowToJudgeAssignment(row: JudgeAssignmentJoinedRow): ReplicatedJudgeAssignment {
  const cls = row.classes ?? null;
  const trial = cls?.trials ?? null;
  return {
    id: String(row.id),
    personId: row.person_id,
    // Prefer the assignment's own show_id; fall back to the trial's so show-level
    // navigation still works when the assignment row predates the show_id backfill.
    showId: row.show_id ?? trial?.show_id ?? null,
    trialId: row.trial_id ?? cls?.trial_id ?? null,
    classId: row.class_id ?? null,
    status: row.status ?? null,
    invitedAt: row.invited_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    fee: row.fee ?? null,
    notes: row.notes ?? null,
    dayCapacityOverride: row.day_capacity_override ?? null,
    className: cls?.name ?? null,
    classElement: cls?.element ?? null,
    classLevel: cls?.level ?? null,
    classStatus: cls?.status ?? null,
    classStartTime: cls?.start_time ?? null,
    classCheckedInCount: cls?.checked_in_count ?? null,
    classScoredCount: cls?.scored_count ?? null,
    classTotalEntries: cls?.total_entries_count ?? null,
    trialDate: trial?.date ?? null,
    trialTimezone: trial?.timezone ?? null,
  };
}
