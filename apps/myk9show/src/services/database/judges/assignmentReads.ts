import {
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication';

export type ActiveJudgeAssignmentStatus = 'confirmed' | 'invited';

const ACTIVE_JUDGE_ASSIGNMENT_STATUSES: ReadonlySet<ActiveJudgeAssignmentStatus> = new Set([
  'confirmed',
  'invited',
]);

function isActiveJudgeAssignmentStatus(
  status: string | null
): status is ActiveJudgeAssignmentStatus {
  return (
    status !== null && ACTIVE_JUDGE_ASSIGNMENT_STATUSES.has(status as ActiveJudgeAssignmentStatus)
  );
}

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

/** Subscribe to replicated assignment changes without exposing the table to callers. */
export function subscribeToJudgeAssignmentChanges(
  listener: (assignments: ReplicatedJudgeAssignment[]) => void
): () => void {
  return replicatedJudgeAssignmentsTable.subscribe(listener);
}
