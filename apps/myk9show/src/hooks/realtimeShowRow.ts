import { replicatedShowsTable } from '@/services/replication';
import { hydrateClubFields, mergeShowData } from '@/store/showStore';
import {
  joinAssignedJudges,
  readClubsByIdOrThrow,
  readJudgeAssignmentsOrNull,
} from '@/store/showStoreReads';
import { useUserStore } from '@/store/userStore';
import type { ReplicatedClub } from '@/services/replication/ReplicatedClubsTable';
import type { StoreShow } from '@/types/show-types';

/**
 * Reads one show after a realtime event, the way the show list loads it. The event payload is
 * only a signal: a partial UPDATE leaves out unchanged TOASTed columns and never carries the
 * joined club fields, so the whole row is pulled into the replicated shows table and hydrated
 * from there (MYK9-2350). Resolves `null` when the server returns no row for this account (soft
 * deleted or no longer visible). A failed fetch throws.
 */
export async function readRealtimeShow(
  showId: string,
  existing: StoreShow | undefined
): Promise<StoreShow | null> {
  const replicated = await replicatedShowsTable.pullShowById(showId);
  if (!replicated) return null;
  const [clubsById, assignments] = await Promise.all([
    readClubsByIdOrThrow().catch(() => new Map<string, ReplicatedClub>()),
    readJudgeAssignmentsOrNull(),
  ]);
  const show = hydrateClubFields(mergeShowData(replicated, existing), clubsById);
  const { people } = useUserStore.getState();
  return { ...show, assignedJudges: joinAssignedJudges(assignments, showId, people, existing) };
}
