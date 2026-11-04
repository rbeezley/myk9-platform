import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { lunchOrdersService, type SaveLunchOrderInput } from './lunchOrdersService';

const ordersKey = (trialId: string) => ['trial-lunch-orders', trialId] as const;
const volunteersKey = (showId: string) => ['lunch-orders-volunteers', showId] as const;

export function useTrialLunchOrders(trialId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ordersKey(trialId),
    queryFn: () => lunchOrdersService.listForTrial(trialId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ordersKey(trialId) });

  const save = useMutation({
    mutationFn: (input: Omit<SaveLunchOrderInput, 'trialId'>) =>
      lunchOrdersService.save({ ...input, trialId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => lunchOrdersService.remove(id),
    onSuccess: invalidate,
  });

  return { query, save, remove };
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

async function fetchVolunteersOnDays(
  showId: string,
  trialIds: readonly string[]
): Promise<VolunteerOnDay[]> {
  const [general, byClass] = await Promise.all([
    supabase
      .from('volunteer_general_assignments')
      .select('trial_id, volunteer:volunteers!inner(name, person_id)')
      .or(generalAssignmentScope(showId, trialIds)),
    supabase
      .from('volunteer_class_assignments')
      .select(
        'volunteer:volunteers!inner(name, person_id), class:classes!inner(trial_id, trial:trials!inner(show_id))'
      )
      .eq('class.trial.show_id' as string, showId),
  ]);
  if (general.error) throw general.error;
  if (byClass.error) throw byClass.error;

  const rows: VolunteerOnDay[] = [];
  for (const row of (general.data ?? []) as unknown as Array<{
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
  for (const row of (byClass.data ?? []) as unknown as Array<{
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

export function useVolunteersOnDays(showId: string, trialIds: readonly string[]) {
  return useQuery({
    queryKey: [...volunteersKey(showId), [...trialIds].sort()],
    queryFn: () => fetchVolunteersOnDays(showId, trialIds),
  });
}
