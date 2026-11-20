import { isLivePremiumRow } from '@/features/premium/premiumClassLabel';

/** The `judge_assignments` row facts the roster rule reads. */
export interface RosterRow {
  person_id: string;
  class_id: string | null;
  trial_id: string | null;
  status: string | null;
  assigned_class: {
    status: string | null;
    deleted_at: string | null;
    trial: { status: string | null; deleted_at: string | null } | null;
  } | null;
}

/** Statuses that keep a judge off the premium, as `premiumTrialJudges` treats them. */
const INACTIVE_STATUSES = new Set(['declined', 'cancelled']);

/**
 * MYK9-2248: the people a published premium lists, by the rule of `premiumTrialJudges` in
 * `supabase/functions/generate-premium/trialJudges.ts`, whose per-trial view this collapses to
 * the whole show. A person is listed when they have an active
 * - pick on a printable class (not deleted or cancelled, on a trial that is not deleted or
 *   cancelled), or
 * - assignment with no class that is not mere roster membership: a show-level row (no trial)
 *   beside class picks that count (a class that is not deleted, on a live trial, a cancelled
 *   class included) is roster membership and does not make a class judge a whole-show judge.
 * A judge whose picks were all cancelled therefore drops off, and never falls back to the whole
 * trial. Declined and cancelled assignments count for nothing.
 */
export function listedJudgeIds(rows: readonly RosterRow[]): Set<string> {
  const active = rows.filter(row => !INACTIVE_STATUSES.has(row.status ?? ''));
  const onLiveTrial = (row: RosterRow) =>
    !!row.assigned_class &&
    (!row.assigned_class.trial || isLivePremiumRow(row.assigned_class.trial));
  const countsAsPick = (row: RosterRow) =>
    row.class_id !== null && onLiveTrial(row) && !row.assigned_class!.deleted_at;
  const printable = (row: RosterRow) => countsAsPick(row) && isLivePremiumRow(row.assigned_class!);

  const withPicks = new Set(active.filter(countsAsPick).map(row => row.person_id));
  const listed = new Set<string>();
  for (const row of active) {
    if (printable(row)) listed.add(row.person_id);
    else if (row.class_id === null && !(row.trial_id === null && withPicks.has(row.person_id))) {
      listed.add(row.person_id);
    }
  }
  return listed;
}
