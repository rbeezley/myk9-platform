import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { VOLUNTEER_COPY, addedButNotAssigned } from './volunteerErrorCopy';
import type { ClassAssignment, Volunteer } from '@/types/volunteer';

/**
 * MYK9-2328: steward writes for Show Desk's class panel and Select classes. They write the same
 * `volunteers` and `volunteer_class_assignments` rows as the Volunteers page and refresh the same
 * query keys, so a change in either place shows in the other. Online-only, like that page.
 *
 * Neither write retries: the app's default retries a PostgREST error once, which would add a
 * walk-up twice when only the second insert failed.
 */

/** Ids the cache holds before the database has answered; never written back. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

interface AddAndAssignInput {
  name: string;
  classId: string;
  roleName: string;
}

/** The volunteer was added, but the job was not given. */
class AssignAfterAddError extends Error {
  constructor(readonly volunteerName: string) {
    super('assignment failed after the volunteer was added');
  }
}

/**
 * Adds a typed name to the show's volunteer list as a walk-up, then gives them the job. Both show
 * at once in the cache, so the picker stops offering the same name while the write is in flight.
 */
export function useAddVolunteerAndAssign(showId: string) {
  const queryClient = useQueryClient();
  const volunteersKey = queryKeys.volunteers(showId);
  const assignmentsKey = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    retry: false,
    mutationFn: async (input: AddAndAssignInput) => {
      const { data: volunteer, error: addError } = await supabase
        .from('volunteers')
        .insert({ name: input.name, show_id: showId, phone: null, notes: null, person_id: null })
        .select('id')
        .single();
      if (addError) throw addError;
      const { error: assignError } = await supabase.from('volunteer_class_assignments').insert({
        volunteer_id: volunteer.id,
        class_id: input.classId,
        role_name: input.roleName,
      });
      if (assignError) throw new AssignAfterAddError(input.name);
      return volunteer.id;
    },
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: volunteersKey });
      await queryClient.cancelQueries({ queryKey: assignmentsKey });
      const now = new Date().toISOString();
      const volunteerId = `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`;
      const assignmentId = `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`;
      queryClient.setQueryData<Volunteer[]>(volunteersKey, old => [
        ...(old ?? []),
        {
          id: volunteerId,
          personId: null,
          name: input.name,
          phone: null,
          notes: null,
          isAvailable: true,
          showId,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      queryClient.setQueryData<ClassAssignment[]>(assignmentsKey, old => [
        ...(old ?? []),
        {
          id: assignmentId,
          volunteerId,
          classId: input.classId,
          roleName: input.roleName,
          status: 'assigned',
          notes: null,
          createdAt: now,
          volunteerName: input.name,
        },
      ]);
      return { volunteerId, assignmentId };
    },
    // Each failure takes back only its own rows, so another add still in flight keeps its chip.
    onError: (error, _input, context) => {
      if (context) {
        queryClient.setQueryData<ClassAssignment[]>(assignmentsKey, old =>
          old?.filter(a => a.id !== context.assignmentId)
        );
      }
      if (error instanceof AssignAfterAddError) {
        // The volunteer row exists; the refetch below shows it without the job.
        notifications.error(addedButNotAssigned(error.volunteerName));
        return;
      }
      if (context) {
        queryClient.setQueryData<Volunteer[]>(volunteersKey, old =>
          old?.filter(v => v.id !== context.volunteerId)
        );
      }
      notifications.error(VOLUNTEER_COPY.addAndAssignFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: volunteersKey });
      queryClient.invalidateQueries({ queryKey: assignmentsKey });
    },
  });
}

/** The classes that do not already have this person in this job, each once. */
export function classesNeedingAssignment(
  classIds: readonly string[],
  volunteerId: string,
  roleName: string,
  existing: readonly ClassAssignment[]
): string[] {
  const held = new Set(
    existing
      .filter(a => a.volunteerId === volunteerId && a.roleName === roleName)
      .map(a => a.classId)
  );
  return [...new Set(classIds)].filter(id => !held.has(id));
}

interface AssignToClassesInput {
  volunteerId: string;
  roleName: string;
  classIds: readonly string[];
}

/**
 * Select classes' Assign steward: one person in one job across the ticked classes, in one write.
 * The cache skips classes already known to have them; the unique key
 * (volunteer_id, class_id, role_name) ignores any another device added since, so a stale cache
 * never fails the batch. Returns how many classes were newly assigned.
 */
export function useAssignToClasses(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    retry: false,
    // Offline, fail at once with the error toast rather than wait unseen for a connection.
    networkMode: 'always',
    mutationFn: async (input: AssignToClassesInput) => {
      const existing = queryClient.getQueryData<ClassAssignment[]>(qk) ?? [];
      const classIds = classesNeedingAssignment(
        input.classIds,
        input.volunteerId,
        input.roleName,
        existing
      );
      if (classIds.length === 0) return 0;
      const { data, error } = await supabase
        .from('volunteer_class_assignments')
        .upsert(
          classIds.map(classId => ({
            volunteer_id: input.volunteerId,
            class_id: classId,
            role_name: input.roleName,
          })),
          { onConflict: 'volunteer_id,class_id,role_name', ignoreDuplicates: true }
        )
        .select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    onError: () => {
      notifications.error(VOLUNTEER_COPY.bulkAssignFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}
