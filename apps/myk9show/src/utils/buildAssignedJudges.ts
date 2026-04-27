import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import type { ShowJudgeAssignment } from '@/types/judge-types';

/**
 * Resolve a judge's display name from the show roster by id.
 *
 * Centralizes the `assignedJudges.find(j => j.judgeId === id)?.judgeName`
 * pattern that recurs in every class-edit form. Returns `undefined` when the
 * id isn't in the roster so callers can decide between `'TBD'` (form-state
 * writes use `?? 'TBD'`) and falling through to the placeholder
 * (Radix `SelectValue` children must be `undefined`, not `''`, to render the
 * placeholder).
 */
export function getJudgeNameById<T extends { judgeId: string; judgeName: string }>(
  judges: ReadonlyArray<T>,
  judgeId: string | undefined
): string | undefined {
  if (!judgeId) return undefined;
  return judges.find(j => j.judgeId === judgeId)?.judgeName;
}

/**
 * Build ShowJudgeAssignment[] from replicated judge assignments + people data.
 * Groups by personId so one judge with multiple class assignments becomes one entry.
 */
export function buildAssignedJudges(
  assignments: ReplicatedJudgeAssignment[],
  showId: string,
  people: Array<{ id: string; firstName: string; lastName: string }>
): ShowJudgeAssignment[] {
  const showAssignments = assignments.filter(a => a.showId === showId);

  const byPerson = new Map<string, ReplicatedJudgeAssignment[]>();
  for (const a of showAssignments) {
    const group = byPerson.get(a.personId) || [];
    group.push(a);
    byPerson.set(a.personId, group);
  }

  return Array.from(byPerson.entries()).map(([personId, group]) => {
    const person = people.find(p => p.id === personId);
    const judgeName = person ? `${person.firstName} ${person.lastName}`.trim() : 'Unknown Judge';
    const firstAssignment = group[0];

    return {
      judgeId: personId,
      judgeName,
      assignedDate:
        firstAssignment.confirmedAt ||
        firstAssignment.invitedAt ||
        new Date().toISOString().split('T')[0],
      assignedClasses: group.map(a => a.classId).filter((id): id is string => id !== null),
    };
  });
}
