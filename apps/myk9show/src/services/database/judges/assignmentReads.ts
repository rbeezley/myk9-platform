import {
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication';
import { isActiveJudgeAssignmentStatus } from './assignmentStatus';

/**
 * Every judge assignment on this device. getAll()/getByShowId() turn a failed
 * IndexedDB read into [], which reads as "no assignments"; this throws instead,
 * so callers reach their error state (MYK9-722, MYK9-769).
 */
export async function readJudgeAssignmentsOrThrow(): Promise<ReplicatedJudgeAssignment[]> {
  const read = await replicatedJudgeAssignmentsTable.getAllWithStatus();
  if (!read.ok) {
    throw new Error(`Could not read judge assignments on this device: ${String(read.error)}`);
  }
  return read.rows;
}

/**
 * Offline-only active class assignments for one judge at one show. A failed
 * device read throws: the at-show class list would otherwise tell a judge at
 * their ring "No classes assigned yet" (MYK9-769).
 */
export async function getActiveJudgeAssignmentsForShow(
  showId: string,
  personId: string
): Promise<ReplicatedJudgeAssignment[]> {
  const assignments = await readJudgeAssignmentsOrThrow();
  return assignments.filter(
    assignment =>
      assignment.showId === showId &&
      assignment.personId === personId &&
      assignment.classId !== null &&
      isActiveJudgeAssignmentStatus(assignment.status)
  );
}

export interface JudgedShow {
  showId: string;
  /** Earliest trial date among the judge's assignments at this show, when known. */
  firstTrialDate: string | null;
}

/**
 * Offline-only: every show the judge holds a confirmed or invited assignment at,
 * earliest trial first. Class-less (show-level) rows count, matching the judge
 * arm of the `show_announcements` INSERT policy (20260917163900), which asks
 * only for an active row on the show.
 */
export async function getActiveJudgeAssignmentShows(personId: string): Promise<JudgedShow[]> {
  // A failed read throws so the caller shows an error, not "no shows".
  const assignments = await readJudgeAssignmentsOrThrow();
  const byShow = new Map<string, string | null>();
  for (const assignment of assignments) {
    const { showId, trialDate } = assignment;
    if (!showId || assignment.personId !== personId) continue;
    if (!isActiveJudgeAssignmentStatus(assignment.status)) continue;
    const known = byShow.get(showId);
    if (!byShow.has(showId) || (trialDate && (!known || trialDate < known))) {
      byShow.set(showId, trialDate ?? known ?? null);
    }
  }
  return [...byShow]
    .map(([showId, firstTrialDate]) => ({ showId, firstTrialDate }))
    .sort((a, b) => compareDatesNullLast(a.firstTrialDate, b.firstTrialDate));
}

function compareDatesNullLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Subscribe to replicated assignment changes without exposing the table to callers. */
export function subscribeToJudgeAssignmentChanges(
  listener: (assignments: ReplicatedJudgeAssignment[]) => void
): () => void {
  return replicatedJudgeAssignmentsTable.subscribe(listener);
}
