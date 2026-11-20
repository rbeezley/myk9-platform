import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { replicatedJudgeAssignmentsTable } from '@/services/replication';
import type { ReplicatedJudgeAssignment } from '@/services/replication';

/**
 * Whether a judge's affiliation can be set on this show yet (MYK9-2294):
 * - `ready`: at least one live (not declined or cancelled) assignment is on the server, which is
 *   all the `set_judge_affiliation` RPC needs;
 * - `waiting`: a live assignment exists only on this device so far (local-only, dirty, or with a
 *   pending or failed mutation), or the judge is ticked but not yet saved;
 * - `inactive`: every assignment is declined or cancelled, so the judge does not print on the
 *   premium and waiting would never enable the field.
 */
export type JudgeAffiliationReadiness = 'ready' | 'waiting' | 'inactive';

const INACTIVE = new Set(['declined', 'cancelled']);

const uploadKey = (showId: string) => ['judgeAssignmentUpload', showId] as const;

async function isOnServer(row: ReplicatedJudgeAssignment): Promise<boolean> {
  if (row._localOnly === true) return false;
  if (row._syncStatus !== undefined && row._syncStatus !== 'synced') return false;
  return !(await replicatedJudgeAssignmentsTable.hasUnsyncedLocalWork(row.id));
}

/** One read of the show's assignments for every judge row; an unread device is never a pass. */
export async function readJudgeAffiliationReadiness(
  showId: string
): Promise<Map<string, JudgeAffiliationReadiness>> {
  const rows = await replicatedJudgeAssignmentsTable.getByShowId(showId);
  const byPerson = new Map<string, ReplicatedJudgeAssignment[]>();
  for (const row of rows) {
    if (!row.personId) continue;
    byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row]);
  }
  const result = new Map<string, JudgeAffiliationReadiness>();
  await Promise.all(
    [...byPerson].map(async ([personId, personRows]) => {
      const live = personRows.filter(row => !INACTIVE.has(row.status ?? 'invited'));
      if (live.length === 0) {
        result.set(personId, 'inactive');
        return;
      }
      const uploaded = await Promise.all(live.map(isOnServer));
      result.set(personId, uploaded.some(Boolean) ? 'ready' : 'waiting');
    })
  );
  return result;
}

/**
 * The readiness of one judge on one show. Every judge row shares one cached read per show
 * (React Query dedupes it). `useJudgeAffiliationReadinessSync` refreshes it when the replicated
 * table changes, so the field enables once the upload is acknowledged. A judge with no row yet,
 * or a failed read, is `waiting`.
 */
export function useJudgeAffiliationReadiness(
  showId: string | undefined,
  personId: string
): JudgeAffiliationReadiness {
  const { data } = useQuery({
    queryKey: uploadKey(showId ?? ''),
    queryFn: () => readJudgeAffiliationReadiness(showId ?? ''),
    enabled: showId !== undefined,
    networkMode: 'always',
    staleTime: Infinity,
  });
  return data?.get(personId) ?? 'waiting';
}

/**
 * Mounted ONCE per judges list: one table listener per show (not one per judge row) that
 * re-reads readiness on every change. The default cancelRefetch restarts a read already in
 * flight, so an acknowledgment that lands mid-read is never missed.
 */
export function useJudgeAffiliationReadinessSync(showId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!showId) return undefined;
    return replicatedJudgeAssignmentsTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: uploadKey(showId) }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);
}
