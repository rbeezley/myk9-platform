import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface ShowJudge {
  id: string;
  name: string;
}

async function fetchShowJudges(showId: string): Promise<ShowJudge[]> {
  const { data, error } = await supabase
    .from('judge_assignments')
    .select(
      `
      person_id,
      people!inner(id, first_name, last_name),
      classes!inner(trial_id, trials!inner(show_id))
    `
    )
    .eq('classes.trials.show_id', showId);

  if (error) throw error;

  const seen = new Set<string>();
  const judges: ShowJudge[] = [];
  for (const row of data || []) {
    const person = row.people as Record<string, unknown>;
    const personId = person.id as string;
    if (seen.has(personId)) continue;
    seen.add(personId);
    const firstName = (person.first_name as string) || '';
    const lastName = (person.last_name as string) || '';
    judges.push({
      id: personId,
      name: `${firstName} ${lastName}`.trim() || 'Unknown Judge',
    });
  }

  return judges.sort((a, b) => a.name.localeCompare(b.name));
}

export function useShowJudges(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showJudges(showId || ''),
    queryFn: () => fetchShowJudges(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
