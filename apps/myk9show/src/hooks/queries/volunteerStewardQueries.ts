import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { VOLUNTEER_COPY } from './volunteerErrorCopy';
import type { ClassAssignment } from '@/types/volunteer';

/**
 * MYK9-2328: Select classes' steward write. It writes the same `volunteer_class_assignments` rows
 * as the Volunteers page and refreshes the same query key, so a change in either place shows in
 * the other. Online-only, like that page.
 */

/** Ids the cache holds before the database has answered (volunteerQueries); never written back. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

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
  /** For the confirmation toast. */
  volunteerName: string;
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
    // A lost response would otherwise send the batch twice.
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
    // Here, not on the dialog, so the toast still shows when the dialog was closed mid-save.
    onSuccess: (count, input) => {
      notifications.success(
        count === 0
          ? `${input.volunteerName} already had this job in those classes.`
          : `${input.volunteerName} is ${input.roleName} for ${count} ${count === 1 ? 'class' : 'classes'}.`
      );
    },
    onError: () => {
      notifications.error(VOLUNTEER_COPY.bulkAssignFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}
