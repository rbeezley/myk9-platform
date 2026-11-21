import { useMemo } from 'react';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';
import {
  useVolunteers,
  useVolunteerClassAssignments,
  useVolunteerConflicts,
  useAssignToClass,
  useUnassignFromClass,
} from './volunteerQueries';
import { OPTIMISTIC_ID_PREFIX, useAddVolunteerAndAssign } from './volunteerStewardQueries';

const EMPTY_VOLUNTEERS: Volunteer[] = [];
const EMPTY_ASSIGNMENTS: ClassAssignment[] = [];
const EMPTY_CONFLICTS = new Map<string, Set<string>>();

type LoadStatus = 'loading' | 'unavailable' | 'ready';

interface QueryState {
  data: unknown;
  isError: boolean;
  isPending: boolean;
  fetchStatus: string;
}

/**
 * One query's state for the screen. Cached data stays shown when a refresh fails. With no data,
 * a fetch that failed, or one paused because the device is offline (`networkMode: 'online'`
 * never fails it), is "unavailable", so the screen says why instead of loading forever.
 */
export function loadStatus(query: QueryState): LoadStatus {
  if (query.data !== undefined) return 'ready';
  if (query.isError || query.fetchStatus === 'paused') return 'unavailable';
  return query.isPending ? 'loading' : 'ready';
}

function combine(...statuses: LoadStatus[]): LoadStatus {
  if (statuses.includes('unavailable')) return 'unavailable';
  if (statuses.includes('loading')) return 'loading';
  return 'ready';
}

/**
 * MYK9-2328: a show's volunteer list, ring-job assignments and conflicts, with the writes Show
 * Desk's class panel needs. The Volunteers page reads the same queries.
 */
export function useClassStewards(showId: string) {
  const volunteersQuery = useVolunteers(showId);
  const assignmentsQuery = useVolunteerClassAssignments(showId);
  const volunteers = volunteersQuery.data ?? EMPTY_VOLUNTEERS;
  const assignments = assignmentsQuery.data ?? EMPTY_ASSIGNMENTS;
  const conflictsQuery = useVolunteerConflicts(showId, volunteers);
  const conflictMap = conflictsQuery.data ?? EMPTY_CONFLICTS;
  const assign = useAssignToClass(showId);
  const unassign = useUnassignFromClass(showId);
  const addAndAssign = useAddVolunteerAndAssign(showId);

  const status = combine(loadStatus(volunteersQuery), loadStatus(assignmentsQuery));
  // The conflicts read runs only when a volunteer is linked to a person; with none it never
  // starts, and there is nothing to warn about.
  const conflictsNeverRan =
    !conflictsQuery.isError &&
    conflictsQuery.fetchStatus === 'idle' &&
    conflictsQuery.data === undefined;
  const conflictsStatus = conflictsNeverRan ? 'ready' : loadStatus(conflictsQuery);

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
    conflictsStatus,
    volunteers,
    assignments,
    assignmentsByClass,
    conflictMap,
    onAssign: (volunteerId: string, classId: string, roleName: string) =>
      assign.mutate({ volunteerId, classId, roleName }),
    // A chip still waiting for the database has no row to delete yet.
    onUnassign: (assignmentId: string) => {
      if (!assignmentId.startsWith(OPTIMISTIC_ID_PREFIX)) unassign.mutate(assignmentId);
    },
    onAddAndAssign: (name: string, classId: string, roleName: string) =>
      addAndAssign.mutate({ name, classId, roleName }),
  };
}
