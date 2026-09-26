import {
  replicatedClassesTable,
  replicatedJudgeAssignmentsTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

const REFRESH_WAIT_MS = 5000;

/**
 * Pull one show's structure (the show row, its trials, their classes, and the
 * judge assignments) onto this device, waiting at most a few seconds. Forced full syncs: a cold scope
 * would take one anyway, and an incremental pass after an earlier sync can
 * skip a row that never arrived (the watermark is already past it). Resolves
 * either way; the caller re-reads the replica and decides from what is there.
 */
export async function refreshShowStructureForRead(
  showId: string,
  cold: { show: boolean; assignments: boolean }
): Promise<void> {
  const forced = { forceFullSync: true };
  const refresh = (async () => {
    await Promise.allSettled([
      replicatedTrialsTable.sync(showId, forced),
      cold.show ? replicatedShowsTable.sync('', forced) : Promise.resolve(),
      cold.assignments ? replicatedJudgeAssignmentsTable.sync() : Promise.resolve(),
    ]);
    const showTrials = await replicatedTrialsTable.getTrialsByShow(showId);
    // Classes replicate per trial; an empty scope would fetch every visible class.
    await Promise.allSettled(
      showTrials.map(trial => replicatedClassesTable.sync(trial.id, forced))
    );
  })().catch(() => undefined);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      refresh,
      new Promise<void>(resolve => {
        timeout = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
