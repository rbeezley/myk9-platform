/**
 * MYK9-2292: the judges the ASCA premium prints, decided from raw `judge_assignments` rows the
 * way `supabase/functions/generate-premium/trialJudges.ts` does (`premiumTrialJudges`), which
 * this app cannot import. A parity test runs both over the same fixtures. A judge counts when,
 * on at least one live trial (not cancelled, not deleted), an assignment is not declined or
 * cancelled and either picks a live class of that trial, or is a class-less row that covers the
 * trial. A show-level roster row (no class, no trial) is ignored while the judge has live picks.
 */
const INACTIVE_STATUSES = new Set(['declined', 'cancelled']);

export interface LiveJudgeAssignmentRow {
  trial_id: string | null;
  class_id: string | null;
  status: string | null;
  person: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    judge_affiliation: string | null;
  } | null;
}

export interface LiveJudgeTrialRow {
  id: string;
  status: string | null;
  deleted_at: string | null;
  classes: ReadonlyArray<{ id: string; deleted_at: string | null }> | null;
}

export interface LiveShowJudge {
  id: string;
  name: string;
  affiliation: string | null;
}

export function liveShowJudges(
  rows: ReadonlyArray<LiveJudgeAssignmentRow>,
  trials: ReadonlyArray<LiveJudgeTrialRow>
): LiveShowJudge[] {
  const liveTrials = trials.filter(trial => !trial.deleted_at && trial.status !== 'cancelled');
  const liveClassIds = new Set(
    liveTrials.flatMap(trial => (trial.classes ?? []).filter(c => !c.deleted_at).map(c => c.id))
  );
  const active = rows.filter(row => row.person && !INACTIVE_STATUSES.has(row.status ?? ''));
  const withLivePicks = new Set(
    active
      .filter(row => row.class_id !== null && liveClassIds.has(row.class_id))
      .map(row => row.person!.id)
  );
  const liveTrialIds = new Set(liveTrials.map(trial => trial.id));
  const found = new Map<string, LiveShowJudge>();
  for (const row of active) {
    const person = row.person!;
    const classPick = row.class_id !== null && liveClassIds.has(row.class_id);
    const rosterOnly = row.trial_id === null && withLivePicks.has(person.id);
    const covers =
      row.class_id === null &&
      !rosterOnly &&
      liveTrials.length > 0 &&
      (row.trial_id === null || liveTrialIds.has(row.trial_id));
    if (!classPick && !covers) continue;
    const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
    if (!name || found.has(person.id)) continue;
    found.set(person.id, {
      id: person.id,
      name,
      affiliation: person.judge_affiliation?.trim() || null,
    });
  }
  return [...found.values()];
}
