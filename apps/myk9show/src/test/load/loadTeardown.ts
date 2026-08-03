export const SCORING_WORKER_QUERY_FRAGMENT = 'ringside_update_entry';
export const DEFAULT_QUIET_ROLLBACK_SAMPLES = 3;

export interface RollbackSample {
  scoringWorkers: number;
  rollbackCount: number;
}

export function isScoringWorkerQuery(query: string): boolean {
  return query.toLowerCase().includes(SCORING_WORKER_QUERY_FRAGMENT);
}

export function hasQuietRollbackWindow(
  samples: readonly RollbackSample[],
  requiredSamples = DEFAULT_QUIET_ROLLBACK_SAMPLES
): boolean {
  if (!Number.isInteger(requiredSamples) || requiredSamples <= 0) return false;
  if (samples.length < requiredSamples) return false;

  const window = samples.slice(-requiredSamples);
  const rollbackCount = window[0]?.rollbackCount;
  return (
    rollbackCount !== undefined &&
    window.every(
      sample =>
        sample.scoringWorkers === 0 &&
        Number.isSafeInteger(sample.rollbackCount) &&
        sample.rollbackCount === rollbackCount
    )
  );
}
