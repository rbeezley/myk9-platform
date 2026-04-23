import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExampleIds } from '../types';

async function firstRow<T extends Record<string, unknown>>(
  table: string,
  columns: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table as any)
    .select(columns)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as T | null) ?? null;
}

export function useExampleIds(): UseQueryResult<ExampleIds, Error> {
  return useQuery<ExampleIds, Error>({
    queryKey: ['admin-help', 'example-ids'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [show, trial, classRow, dog, club, role, template, person, entry, registration, user] =
        await Promise.all([
          firstRow<{ id: string }>('shows', 'id'),
          firstRow<{ id: string; show_id: string }>('trials', 'id, show_id'),
          firstRow<{ id: string; trial_id: string; show_id: string }>(
            'classes',
            'id, trial_id, show_id'
          ),
          firstRow<{ id: string }>('dogs', 'id'),
          firstRow<{ id: string }>('clubs', 'id'),
          firstRow<{ id: string }>('roles', 'id'),
          firstRow<{ id: string }>('organization_templates', 'id'),
          firstRow<{ id: string }>('people', 'id'),
          firstRow<{ id: string }>('entries', 'id'),
          firstRow<{ id: string }>('show_registrations', 'id'),
          firstRow<{ id: string }>('profiles', 'id'),
        ]);

      const result: ExampleIds = {};
      if (show?.id) result.showId = show.id;
      if (trial?.id) result.trialId = trial.id;
      if (trial?.show_id) result.trialShowId = trial.show_id;
      if (classRow?.id) result.classId = classRow.id;
      if (classRow?.trial_id) result.classTrialId = classRow.trial_id;
      if (classRow?.show_id) result.classShowId = classRow.show_id;
      if (dog?.id) result.dogId = dog.id;
      if (club?.id) result.clubId = club.id;
      if (role?.id) result.roleId = role.id;
      if (template?.id) result.templateId = template.id;
      if (person?.id) result.personId = person.id;
      if (entry?.id) result.entryId = entry.id;
      if (registration?.id) result.registrationId = registration.id;
      if (user?.id) result.userId = user.id;
      return result;
    },
  });
}
