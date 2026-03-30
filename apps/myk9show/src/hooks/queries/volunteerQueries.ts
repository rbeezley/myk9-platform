import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import type { Volunteer, ClassAssignment, GeneralAssignment } from '@/types/volunteer';

// Note: show_id on volunteers table is added by migration 095 but not yet
// in the generated supabase types. We use type assertions where needed.

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapVolunteerRow(row: Record<string, unknown>): Volunteer {
  return {
    id: row.id as string,
    personId: (row.person_id as string) ?? null,
    name: row.name as string,
    phone: (row.phone as string) ?? null,
    notes: (row.notes as string) ?? null,
    isAvailable: (row.is_available as boolean) ?? true,
    showId: (row.show_id as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function mapClassAssignmentRow(row: Record<string, unknown>): ClassAssignment {
  const volunteer = row.volunteer as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    volunteerId: row.volunteer_id as string,
    classId: row.class_id as string,
    roleName: (row.role_name as string) ?? '',
    status: (row.status as string) ?? 'assigned',
    notes: (row.notes as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
    volunteerName: (volunteer?.name as string) ?? '',
  };
}

function mapGeneralAssignmentRow(row: Record<string, unknown>): GeneralAssignment {
  const volunteer = row.volunteer as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    volunteerId: row.volunteer_id as string,
    showId: (row.show_id as string) ?? '',
    roleName: (row.role_name as string) ?? '',
    shiftStart: (row.shift_start as string) ?? null,
    shiftEnd: (row.shift_end as string) ?? null,
    status: (row.status as string) ?? 'assigned',
    notes: (row.notes as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
    volunteerName: (volunteer?.name as string) ?? '',
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useVolunteers(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteers(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await (
        supabase.from('volunteers') as ReturnType<typeof supabase.from>
      )
        .select('*')
        .eq('show_id' as string, showId!);
      if (error) throw error;
      return (data ?? []).map(row => mapVolunteerRow(row as Record<string, unknown>));
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export function useVolunteerClassAssignments(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteerClassAssignments(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_class_assignments')
        .select(
          `*,
          volunteer:volunteers!inner(name),
          class:classes!inner(trial:trials!inner(show_id))`
        )
        .eq('class.trial.show_id' as string, showId!);
      if (error) throw error;
      return (data ?? []).map(row =>
        mapClassAssignmentRow(row as unknown as Record<string, unknown>)
      );
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export function useVolunteerGeneralAssignments(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteerGeneralAssignments(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_general_assignments')
        .select('*, volunteer:volunteers!inner(name)')
        .eq('show_id', showId!);
      if (error) throw error;
      return (data ?? []).map(row =>
        mapGeneralAssignmentRow(row as unknown as Record<string, unknown>)
      );
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export interface PersonSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export function useSearchPeople(query: string) {
  return useQuery({
    queryKey: queryKeys.peopleSearch(query),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, phone')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []).map(
        (row): PersonSearchResult => ({
          id: row.id,
          firstName: row.first_name ?? '',
          lastName: row.last_name ?? '',
          phone: row.phone ?? null,
        })
      );
    },
    enabled: query.length >= 2,
    ...cacheStrategies.moderate,
  });
}

/**
 * Builds a Map<volunteerId, Set<classId>> of conflicts.
 * A conflict = volunteer's linked person is entered in a class.
 */
export function useVolunteerConflicts(showId: string | undefined, volunteers: Volunteer[]) {
  const personIds = volunteers.filter(v => v.personId !== null).map(v => v.personId!);

  return useQuery({
    queryKey: ['volunteer-conflicts', showId, personIds.sort().join(',')],
    queryFn: async () => {
      if (personIds.length === 0) return new Map<string, Set<string>>();

      const { data, error } = await supabase
        .from('entries')
        .select('handler_id, class_id, class:classes!inner(trial:trials!inner(show_id))')
        .eq('class.trial.show_id' as string, showId!)
        .not('handler_id', 'is', null);
      if (error) throw error;

      // Build person→volunteer lookup
      const personToVolunteer = new Map<string, string>();
      for (const v of volunteers) {
        if (v.personId) personToVolunteer.set(v.personId, v.id);
      }

      // Build conflict map
      const conflicts = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        const handlerId = (row as Record<string, unknown>).handler_id as string;
        const classId = (row as Record<string, unknown>).class_id as string;
        const volunteerId = personToVolunteer.get(handlerId);
        if (volunteerId) {
          if (!conflicts.has(volunteerId)) conflicts.set(volunteerId, new Set());
          conflicts.get(volunteerId)!.add(classId);
        }
      }
      return conflicts;
    },
    enabled: !!showId && personIds.length > 0,
    ...cacheStrategies.moderate,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

interface AddVolunteerInput {
  name: string;
  showId: string;
  phone: string | null;
  notes: string | null;
  personId: string | null;
}

export function useAddVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddVolunteerInput) => {
      const { data, error } = await (
        supabase.from('volunteers') as ReturnType<typeof supabase.from>
      )
        .insert({
          name: input.name,
          show_id: input.showId,
          phone: input.phone,
          notes: input.notes,
          person_id: input.personId,
        } as Record<string, unknown>)
        .select()
        .single();
      if (error) throw error;
      return mapVolunteerRow(data as Record<string, unknown>);
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(data.showId) });
    },
    onError: () => {
      notifications.error('Failed to add volunteer');
    },
  });
}

interface UpdateVolunteerInput {
  id: string;
  showId: string;
  name: string;
  phone: string | null;
  notes: string | null;
  personId: string | null;
}

export function useUpdateVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateVolunteerInput) => {
      const { error } = await supabase
        .from('volunteers')
        .update({
          name: input.name,
          phone: input.phone,
          notes: input.notes,
          person_id: input.personId,
        })
        .eq('id', input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(data.showId) });
    },
    onError: () => {
      notifications.error('Failed to update volunteer');
    },
  });
}

export function useDeleteVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, showId }: { id: string; showId: string }) => {
      const { error } = await supabase.from('volunteers').delete().eq('id', id);
      if (error) throw error;
      return { showId };
    },
    onSuccess: ({ showId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteerClassAssignments(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteerGeneralAssignments(showId) });
    },
    onError: () => {
      notifications.error('Failed to delete volunteer');
    },
  });
}

interface AssignToClassInput {
  volunteerId: string;
  classId: string;
  roleName: string;
}

export function useAssignToClass(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    mutationFn: async (input: AssignToClassInput) => {
      const { data, error } = await supabase
        .from('volunteer_class_assignments')
        .insert({
          volunteer_id: input.volunteerId,
          class_id: input.classId,
          role_name: input.roleName,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<ClassAssignment[]>(qk);
      queryClient.setQueryData<ClassAssignment[]>(qk, old => [
        ...(old ?? []),
        {
          id: `optimistic-${Date.now()}`,
          volunteerId: input.volunteerId,
          classId: input.classId,
          roleName: input.roleName,
          status: 'assigned',
          notes: null,
          createdAt: new Date().toISOString(),
          volunteerName: '',
        },
      ]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to assign volunteer');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useUnassignFromClass(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerClassAssignments(showId);
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('volunteer_class_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onMutate: async assignmentId => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<ClassAssignment[]>(qk);
      queryClient.setQueryData<ClassAssignment[]>(qk, old =>
        (old ?? []).filter(a => a.id !== assignmentId)
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to unassign volunteer');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}

interface AssignToGeneralDutyInput {
  volunteerId: string;
  showId: string;
  roleName: string;
}

export function useAssignToGeneralDuty(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerGeneralAssignments(showId);
  return useMutation({
    mutationFn: async (input: AssignToGeneralDutyInput) => {
      const { data, error } = await supabase
        .from('volunteer_general_assignments')
        .insert({
          volunteer_id: input.volunteerId,
          show_id: input.showId,
          role_name: input.roleName,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<GeneralAssignment[]>(qk);
      queryClient.setQueryData<GeneralAssignment[]>(qk, old => [
        ...(old ?? []),
        {
          id: `optimistic-${Date.now()}`,
          volunteerId: input.volunteerId,
          showId: input.showId,
          roleName: input.roleName,
          shiftStart: null,
          shiftEnd: null,
          status: 'assigned',
          notes: null,
          createdAt: new Date().toISOString(),
          volunteerName: '',
        },
      ]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to assign volunteer to duty');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useUnassignFromGeneralDuty(showId: string) {
  const queryClient = useQueryClient();
  const qk = queryKeys.volunteerGeneralAssignments(showId);
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('volunteer_general_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onMutate: async assignmentId => {
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<GeneralAssignment[]>(qk);
      queryClient.setQueryData<GeneralAssignment[]>(qk, old =>
        (old ?? []).filter(a => a.id !== assignmentId)
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk, context.previous);
      notifications.error('Failed to unassign volunteer from duty');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });
}
