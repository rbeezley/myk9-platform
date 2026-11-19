/**
 * MYK9-2044: the trials a premium prints in its schedule: not cancelled and not soft-deleted.
 * The premium's recording fee line is derived in the app from the trial dates the schedule
 * prints, so filtering here also keeps a cancelled trial out of that line.
 *
 * MYK9-2186: returned in schedule order (date, then start time, then id), because the PostgREST
 * embed has no order and the first live trial picks the premium template.
 */
export interface PremiumScheduleTrialRow {
  id?: string | null;
  date?: string | null;
  planned_start_time?: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

const sortKey = (value: string | null | undefined) => value ?? '￿';

function compareSchedule(a: PremiumScheduleTrialRow, b: PremiumScheduleTrialRow): number {
  return (
    sortKey(a.date).localeCompare(sortKey(b.date)) ||
    sortKey(a.planned_start_time).localeCompare(sortKey(b.planned_start_time)) ||
    sortKey(a.id).localeCompare(sortKey(b.id))
  );
}

export function livePremiumTrials<T extends PremiumScheduleTrialRow>(
  trials: readonly T[] | null | undefined
): T[] {
  return (trials ?? [])
    .filter(trial => !trial.deleted_at && trial.status !== 'cancelled')
    .sort(compareSchedule);
}
