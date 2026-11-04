import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { lunchOrdersService, type SaveLunchOrderInput } from './lunchOrdersService';
import type { LunchListItem } from './lunchOrders';

export function useTrialLunchOrders(trialId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.lunchOrders(trialId),
    queryFn: () => lunchOrdersService.listForTrial(trialId),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.lunchOrders(trialId) });

  // Names and dietary notes are private: keep them out of the global mutation-error log
  // (queryClient.ts redacts variables when this flag is set).
  const meta = { sensitiveVariables: true };

  const save = useMutation({
    meta,
    mutationFn: (input: Omit<SaveLunchOrderInput, 'trialId'>) =>
      lunchOrdersService.save({ ...input, trialId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    meta,
    mutationFn: (id: string) => lunchOrdersService.remove(id),
    onSuccess: invalidate,
  });

  return { query, save, remove };
}

export interface LunchRowSaveInput {
  item: Pick<LunchListItem, 'savedId' | 'personId' | 'name' | 'role'>;
  lunchOrder: string;
  dietaryNote: string;
}

/**
 * The explicit Save for one row: writes BOTH fields. The row is found by its saved id first
 * (added people, and anyone already saved); otherwise it is inserted, with the (trial, person)
 * unique index and the service's 23505 fallback covering a save from another device. Never
 * matched by name when an id exists, so two same-name added people stay separate rows.
 */
export function useLunchRowSave(trialId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Names and dietary notes are private (queryClient.ts redacts variables with this flag).
    meta: { sensitiveVariables: true },
    mutationFn: ({ item, lunchOrder, dietaryNote }: LunchRowSaveInput) =>
      lunchOrdersService.save({
        trialId,
        savedId: item.savedId,
        personId: item.personId,
        name: item.name,
        role: item.role,
        lunchOrder,
        dietaryNote,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.lunchOrders(trialId) }),
  });
}

/** A volunteer working a day. `trialId` is null for a show-wide duty, which covers every day. */
export interface VolunteerOnDay {
  personId: string | null;
  name: string;
  trialId: string | null;
}

interface VolunteerJoin {
  name: string | null;
  person_id: string | null;
}

/**
 * A general duty can carry show_id, trial_id or both (both columns are nullable), so match a row
 * on either: its show, or any of the show's days.
 */
export function generalAssignmentScope(showId: string, trialIds: readonly string[]): string {
  return trialIds.length > 0
    ? `show_id.eq.${showId},trial_id.in.(${trialIds.join(',')})`
    : `show_id.eq.${showId}`;
}

async function fetchGeneralDuties(
  showId: string,
  trialIds: readonly string[]
): Promise<VolunteerOnDay[]> {
  const { data, error } = await supabase
    .from('volunteer_general_assignments')
    .select('trial_id, volunteer:volunteers!inner(name, person_id)')
    .or(generalAssignmentScope(showId, trialIds));
  if (error) throw error;

  const rows: VolunteerOnDay[] = [];
  for (const row of (data ?? []) as unknown as Array<{
    trial_id: string | null;
    volunteer: VolunteerJoin | null;
  }>) {
    if (!row.volunteer?.name) continue;
    rows.push({
      personId: row.volunteer.person_id,
      name: row.volunteer.name,
      trialId: row.trial_id,
    });
  }
  return rows;
}

async function fetchClassDuties(showId: string): Promise<VolunteerOnDay[]> {
  const { data, error } = await supabase
    .from('volunteer_class_assignments')
    .select(
      'volunteer:volunteers!inner(name, person_id), class:classes!inner(trial_id, trial:trials!inner(show_id))'
    )
    .eq('class.trial.show_id' as string, showId);
  if (error) throw error;

  const rows: VolunteerOnDay[] = [];
  for (const row of (data ?? []) as unknown as Array<{
    volunteer: VolunteerJoin | null;
    class: { trial_id: string } | null;
  }>) {
    if (!row.volunteer?.name || !row.class) continue;
    rows.push({
      personId: row.volunteer.person_id,
      name: row.volunteer.name,
      trialId: row.class.trial_id,
    });
  }
  return rows;
}

export interface VolunteersOnDaysResult {
  data: VolunteerOnDay[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Both reads sit under the existing volunteer-assignment query keys (queryClient.ts), so adding or
 * removing an assignment refreshes this roster through the invalidations those mutations already do.
 */
export function useVolunteersOnDays(
  showId: string,
  trialIds: readonly string[],
  enabled = true
): VolunteersOnDaysResult {
  const general = useQuery({
    queryKey: queryKeys.lunchVolunteersGeneral(showId, trialIds),
    enabled,
    queryFn: () => fetchGeneralDuties(showId, trialIds),
  });
  const byClass = useQuery({
    queryKey: queryKeys.lunchVolunteersByClass(showId),
    enabled,
    queryFn: () => fetchClassDuties(showId),
  });

  return {
    data: general.data && byClass.data ? [...general.data, ...byClass.data] : undefined,
    isLoading: general.isLoading || byClass.isLoading,
    isFetching: general.isFetching || byClass.isFetching,
    isError: general.isError || byClass.isError,
    refetch: () => {
      if (general.isError) void general.refetch();
      if (byClass.isError) void byClass.refetch();
    },
  };
}
