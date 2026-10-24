import { formatTrialLabel } from '@myk9/core';
import { replicatedShowsTable, replicatedTrialsTable } from '@/services/replication';
import type { JudgeClass } from '@/pages/judgeStatsUtils';

/**
 * Names the show and trial on each assignment (MYK9-1342), read from the replicated shows and
 * trials stores. The trial label is the one the at-show class header uses (`formatTrialLabel`).
 * Fails open: a store that is cold or unreadable leaves that label off; the card still renders.
 */
async function safely<T>(read: () => Promise<T | null | undefined>): Promise<T | undefined> {
  try {
    return (await read()) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function decorateWithShowTrialLabels(
  assignments: JudgeClass[]
): Promise<JudgeClass[]> {
  const showIds = [...new Set(assignments.map(a => a.showId).filter(Boolean))];
  const trialIds = [...new Set(assignments.map(a => a.trialId).filter(Boolean))];
  const [shows, trials] = await Promise.all([
    Promise.all(
      showIds.map(
        async id => [id, await safely(() => replicatedShowsTable.getShowById(id))] as const
      )
    ),
    Promise.all(
      trialIds.map(
        async id => [id, await safely(() => replicatedTrialsTable.getTrialById(id))] as const
      )
    ),
  ]);
  const showById = new Map(shows);
  const trialById = new Map(trials);

  return assignments.map(assignment => {
    const showName = showById.get(assignment.showId)?.name?.trim();
    const trial = trialById.get(assignment.trialId);
    return {
      ...assignment,
      ...(showName ? { showName } : {}),
      ...(trial
        ? { trialLabel: formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber }) }
        : {}),
    };
  });
}
