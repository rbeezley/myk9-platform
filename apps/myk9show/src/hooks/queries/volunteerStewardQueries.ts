import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { VOLUNTEER_COPY } from './volunteerErrorCopy';
import type { ClassAssignment } from '@/types/volunteer';

/**
 * MYK9-2328: steward writes for Show Desk's class panel and Select classes. They write the same
 * `volunteers` and `volunteer_class_assignments` rows as the Volunteers page and refresh the same
 * query keys, so a change in either place shows in the other. Online-only, like that page.
 */

interface AddAndAssignInput {
  name: string;
  classId: string;
  roleName: string;
}

/** Adds a typed name to the show's volunteer list as a walk-up, then gives them the job. */
export function useAddVolunteerAndAssign(showId: string) {
  const queryClient = useQueryClient();
  return useMutation({
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
      if (assignError) throw assignError;
      return volunteer.id;
    },
    onError: () => {
      notifications.error(VOLUNTEER_COPY.addAndAssignFailed);
    },
    onSettled: () => {
      // Settled, not success: if the assignment failed, the volunteer was still added.
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteerClassAssignments(showId) });
    },
  });
}

/**
 * The classes that still need this person in this job. The table's unique key includes a
 * `role_id` this app never sets, so the database would accept a duplicate; skip it here.
 */
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

/** Select classes' Assign steward: one person in one job across the ticked classes, in one write. */
export function useAssignToClasses(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    mutationFn: async (input: AssignToClassesInput) => {
      const existing = queryClient.getQueryData<ClassAssignment[]>(qk) ?? [];
      const classIds = classesNeedingAssignment(
        input.classIds,
        input.volunteerId,
        input.roleName,
        existing
      );
      if (classIds.length === 0) return 0;
      const { error } = await supabase.from('volunteer_class_assignments').insert(
        classIds.map(classId => ({
          volunteer_id: input.volunteerId,
          class_id: classId,
          role_name: input.roleName,
        }))
      );
      if (error) throw error;
      return classIds.length;
    },
    onError: () => {
      notifications.error(VOLUNTEER_COPY.bulkAssignFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}
