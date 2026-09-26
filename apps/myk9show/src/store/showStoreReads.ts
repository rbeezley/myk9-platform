import { replicatedShowsTable, type ReplicatedShow } from '@/services/replication';
import {
  replicatedClubsTable,
  type ReplicatedClub,
} from '@/services/replication/ReplicatedClubsTable';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { readJudgeAssignmentsOrThrow } from '@/services/database/judges/assignmentReads';
import { rowsOrThrow } from '@/services/database/_shared/readRows';
import { buildAssignedJudges } from '@/utils/buildAssignedJudges';
import type { StoreShow } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';

// The show store's device reads. getAll() hands back [] for a failed IndexedDB
// read, and the store would then show "no shows" or a show with no judges as
// fact (MYK9-774). These throw, or say "unknown", instead.

/** Every show in start-date order. Throws when the device could not read. */
export async function readShowsOrThrow(): Promise<ReplicatedShow[]> {
  const shows = await rowsOrThrow(
    replicatedShowsTable.getAllWithStatus(),
    'Could not read shows on this device'
  );
  return shows.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

/** Clubs keyed by id. Throws when the device could not read. */
export async function readClubsByIdOrThrow(): Promise<Map<string, ReplicatedClub>> {
  const clubs = await rowsOrThrow(
    replicatedClubsTable.getAllWithStatus(),
    'Could not read clubs on this device'
  );
  return new Map(clubs.map(c => [c.id, c]));
}

/** Every judge assignment, or null when the device could not read them. */
export async function readJudgeAssignmentsOrNull(): Promise<ReplicatedJudgeAssignment[] | null> {
  try {
    return await readJudgeAssignmentsOrThrow();
  } catch {
    return null;
  }
}

/**
 * A show's judges from the assignment read. When the read failed (null), the
 * show keeps the judges it already had rather than showing none.
 */
export function joinAssignedJudges(
  assignments: ReplicatedJudgeAssignment[] | null,
  showId: string,
  people: Parameters<typeof buildAssignedJudges>[2],
  existing: Pick<StoreShow, 'assignedJudges'> | undefined
): ShowJudgeAssignment[] {
  if (!assignments) return existing?.assignedJudges ?? [];
  return buildAssignedJudges(assignments, showId, people);
}
