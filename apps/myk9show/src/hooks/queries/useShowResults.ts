/**
 * Hook for fetching public results for a show — podium placements (1st–4th).
 * Queries view_public_entry_results for scored entries with placements,
 * grouped by class.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { isPrivateResultRow } from '@/lib/resultsPrivacy';

export interface Placement {
  placement: 1 | 2 | 3 | 4;
  handlerName: string;
  dogName: string;
  breed: string;
  armband: string | null;
  /** MYK9-969: an anonymised "Private entry" holding its place in the standings. */
  isPrivate?: boolean | undefined;
}

export interface ClassResult {
  classId: string;
  className: string;
  element: string;
  level: string;
  section: string | null;
  trialId: string;
  resultsReleasedAt: string | null;
  placements: Placement[];
}

async function fetchShowResults(showId: string): Promise<ClassResult[]> {
  // Fetch scored entries with placements 1–4 for this show. Read through
  // view_public_entry_results so the release gate and the result-visibility
  // cascade are enforced by the database: a class whose results have not been
  // released yields no rows at all (MYK9-466, MYK9-552), and within a released
  // class a withheld placement arrives NULL and is filtered out by the placement
  // range below.
  const { data, error } = await supabase
    .from('view_public_entry_results')
    .select(
      'class_id, class_name, class_element, class_level, class_results_released_at, trial_id, dog_id, handler, dog_call_name, dog_breed, armband, final_placement'
    )
    .eq('show_id', showId)
    .eq('is_scored', true)
    .gte('final_placement', 1)
    .lte('final_placement', 4)
    .order('class_element')
    .order('class_level')
    .order('final_placement');

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Group entries by class
  const classMap = new Map<string, ClassResult>();

  for (const row of data) {
    if (!row.class_id) continue;
    const classId = row.class_id;
    if (!classMap.has(classId)) {
      classMap.set(classId, {
        classId,
        className: row.class_name || 'Unknown Class',
        element: row.class_element || '',
        level: row.class_level || '',
        section: null,
        trialId: row.trial_id || '',
        resultsReleasedAt: row.class_results_released_at ?? null,
        placements: [],
      });
    }

    const cls = classMap.get(classId)!;
    const isPrivate = isPrivateResultRow(row);
    cls.placements.push({
      placement: row.final_placement as 1 | 2 | 3 | 4,
      // A private entry has no handler to name; "Unknown" would read as a gap.
      handlerName: row.handler || (isPrivate ? '' : 'Unknown'),
      dogName: row.dog_call_name || 'Unknown',
      breed: row.dog_breed || '',
      armband: row.armband,
      isPrivate,
    });
  }

  return Array.from(classMap.values());
}

export const showResultsQueryKey = (showId: string | undefined) =>
  ['show', showId, 'results'] as const;

export function useShowResults(showId: string | undefined) {
  return useQuery({
    queryKey: showResultsQueryKey(showId),
    queryFn: () => fetchShowResults(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
