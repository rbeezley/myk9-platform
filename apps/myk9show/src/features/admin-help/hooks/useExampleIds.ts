import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/supabase';
import type { ExampleIds } from '../types';

type IdOnlyTable = 'shows' | 'dogs' | 'clubs' | 'roles' | 'entries';

async function firstId(table: IdOnlyTable): Promise<{ id: string } | null> {
  const { data, error } = await supabase.from(table).select('id').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function firstTrial(): Promise<Pick<Tables<'trials'>, 'id' | 'show_id'> | null> {
  const { data, error } = await supabase
    .from('trials')
    .select('id, show_id')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function firstClass(): Promise<Pick<Tables<'classes'>, 'id' | 'trial_id'> | null> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, trial_id')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useExampleIds(): UseQueryResult<ExampleIds, Error> {
  return useQuery<ExampleIds, Error>({
    queryKey: ['admin-help', 'example-ids'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // classes.show_id does not exist — classes link to shows via trial_id (see migration 164)
      // organization_templates table is not yet built (post-fall deliverable) — skip gracefully
      const [show, trial, classRow, dog, club, role, entry] = await Promise.all([
        firstId('shows'),
        firstTrial(),
        firstClass(),
        firstId('dogs'),
        firstId('clubs'),
        firstId('roles'),
        firstId('entries'),
      ]);

      const result: ExampleIds = {};
      if (show?.id) result.showId = show.id;
      if (trial?.id) result.trialId = trial.id;
      if (trial?.show_id) result.trialShowId = trial.show_id;
      if (classRow?.id) result.classId = classRow.id;
      if (classRow?.trial_id) result.classTrialId = classRow.trial_id;
      if (dog?.id) result.dogId = dog.id;
      if (club?.id) result.clubId = club.id;
      if (role?.id) result.roleId = role.id;
      if (entry?.id) result.entryId = entry.id;
      return result;
    },
  });
}
