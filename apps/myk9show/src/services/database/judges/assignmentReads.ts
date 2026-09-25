import {
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication';
import { isActiveJudgeAssignmentStatus } from './assignmentStatus';

/** Offline-only active class assignments for one judge at one show. */
export async function getActiveJudgeAssignmentsForShow(
  showId: string,
  personId: string
): Promise<ReplicatedJudgeAssignment[]> {
  const assignments = await replicatedJudgeAssignmentsTable.getByShowId(showId);
  return assignments.filter(
    assignment =>
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
  const assignments = await replicatedJudgeAssignmentsTable.getAll();
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
