/**
 * MYK9-2044: the trials a premium prints in its schedule: not cancelled and not soft-deleted.
 * The premium's recording fee line is derived in the app from the trial dates the schedule
 * prints, so filtering here also keeps a cancelled trial out of that line.
 */
export interface PremiumScheduleTrialRow {
  status?: string | null;
  deleted_at?: string | null;
}

export function livePremiumTrials<T extends PremiumScheduleTrialRow>(
  trials: readonly T[] | null | undefined
): T[] {
  return (trials ?? []).filter(trial => !trial.deleted_at && trial.status !== 'cancelled');
}
