import { useMemo } from 'react';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';
import {
  useVolunteers,
  useVolunteerClassAssignments,
  useVolunteerConflicts,
  useAssignToClass,
  useUnassignFromClass,
} from './volunteerQueries';
import { useAddVolunteerAndAssign } from './volunteerStewardQueries';

const EMPTY_VOLUNTEERS: Volunteer[] = [];
const EMPTY_ASSIGNMENTS: ClassAssignment[] = [];
const EMPTY_CONFLICTS = new Map<string, Set<string>>();

type ClassStewardsStatus = 'loading' | 'error' | 'ready';

/**
 * MYK9-2328: a show's volunteer list, ring-job assignments and conflicts, with the writes Show
 * Desk's class panel needs. The Volunteers page reads the same queries.
 */
export function useClassStewards(showId: string) {
  const volunteersQuery = useVolunteers(showId);
  const assignmentsQuery = useVolunteerClassAssignments(showId);
  const volunteers = volunteersQuery.data ?? EMPTY_VOLUNTEERS;
  const assignments = assignmentsQuery.data ?? EMPTY_ASSIGNMENTS;
  const { data: conflictMap = EMPTY_CONFLICTS } = useVolunteerConflicts(showId, volunteers);
  const assign = useAssignToClass(showId);
  const unassign = useUnassignFromClass(showId);
  const addAndAssign = useAddVolunteerAndAssign(showId);

  const status: ClassStewardsStatus =
    volunteersQuery.isError || assignmentsQuery.isError
      ? 'error'
      : volunteersQuery.isPending || assignmentsQuery.isPending
        ? 'loading'
        : 'ready';

  const assignmentsByClass = useMemo(() => {
    const byClass = new Map<string, ClassAssignment[]>();
    for (const a of assignments) {
      const list = byClass.get(a.classId);
      if (list) list.push(a);
      else byClass.set(a.classId, [a]);
    }
    return byClass;
  }, [assignments]);

  return {
    status,
    volunteers,
    assignments,
    assignmentsByClass,
    conflictMap,
    onAssign: (volunteerId: string, classId: string, roleName: string) =>
      assign.mutate({ volunteerId, classId, roleName }),
    onUnassign: (assignmentId: string) => unassign.mutate(assignmentId),
    onAddAndAssign: (name: string, classId: string, roleName: string) =>
      addAndAssign.mutate({ name, classId, roleName }),
  };
}
