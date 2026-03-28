/**
 * Hook for fetching public results for a show — podium placements (1st–4th).
 * Queries view_entry_with_results for scored entries with placements,
 * grouped by class.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';

export interface Placement {
  placement: 1 | 2 | 3 | 4;
  handlerName: string;
  dogName: string;
  breed: string;
  armband: string | null;
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

export interface ResultsFilters {
  element: string | null;
  level: string | null;
}

async function fetchShowResults(showId: string): Promise<ClassResult[]> {
  // Fetch scored entries with placements 1–4 for this show
  // TODO: Remove cast after regenerating Supabase types with migration 094
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any)
    .from('view_entry_with_results')
    .select(
      'class_id, class_name, class_element, class_level, class_results_released_at, trial_id, handler, dog_call_name, dog_breed, armband, final_placement'
    )
    .eq('show_id', showId)
    .eq('is_scored', true)
    .gte('final_placement', 1)
    .lte('final_placement', 4)
    .order('class_element')
    .order('class_level')
    .order('final_placement')) as { data: Record<string, unknown>[] | null; error: Error | null };

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Group entries by class
  const classMap = new Map<string, ClassResult>();

  for (const row of data) {
    const classId = row.class_id as string;
    if (!classMap.has(classId)) {
      classMap.set(classId, {
        classId,
        className: (row.class_name as string) || 'Unknown Class',
        element: (row.class_element as string) || '',
        level: (row.class_level as string) || '',
        section: null,
        trialId: (row.trial_id as string) || '',
        resultsReleasedAt: (row.class_results_released_at as string) ?? null,
        placements: [],
      });
    }

    const cls = classMap.get(classId)!;
    cls.placements.push({
      placement: row.final_placement as 1 | 2 | 3 | 4,
      handlerName: (row.handler as string) || 'Unknown',
      dogName: (row.dog_call_name as string) || 'Unknown',
      breed: (row.dog_breed as string) || '',
      armband: row.armband as string | null,
    });
  }

  return Array.from(classMap.values());
}

export function useShowResults(showId: string | undefined) {
  return useQuery({
    queryKey: ['show', showId, 'results'],
    queryFn: () => fetchShowResults(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/**
 * Apply client-side element/level filters to results.
 */
export function filterResults(results: ClassResult[], filters: ResultsFilters): ClassResult[] {
  return results.filter(cls => {
    if (filters.element && cls.element !== filters.element) return false;
    if (filters.level && cls.level !== filters.level) return false;
    return true;
  });
}

/**
 * Extract unique elements and levels from results for filter options.
 */
export function getFilterOptions(results: ClassResult[]) {
  const elements = [...new Set(results.map(r => r.element).filter(Boolean))].sort();
  const levels = [...new Set(results.map(r => r.level).filter(Boolean))].sort();
  return { elements, levels };
}
