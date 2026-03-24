/**
 * React Query hook for fetching class requirements by organization, element, and level.
 *
 * Used by the ClassRequirementsPanel to display requirements in a slide-out panel.
 * This is a read-only query hook; the existing useClassRequirements hook in
 * src/hooks/useClassRequirements.ts handles auto-fill logic for ClassEditForm.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';

/** Requirements data from the class_requirements table. */
export interface ClassRequirements {
  organization: string;
  element: string;
  level: string;
  hides: string;
  distractions: string;
  height: string;
  area_count: number;
  area_size: string;
  time_limit_text: string;
  time_limit_seconds: number | null;
  has_30_second_warning: boolean | null;
  time_type: 'fixed' | 'range' | 'dictated' | null;
  warning_notes: string | null;
  required_calls: string | null;
  final_response: string | null;
  containers_items: string | null;
  area_count_min: number | null;
  area_count_max: number | null;
}

interface UseClassRequirementsOptions {
  organization: string | null;
  element: string;
  level: string;
  /** When false, the query won't fire (e.g., panel is closed). Defaults to true. */
  enabled?: boolean;
}

interface UseClassRequirementsResult {
  requirements: ClassRequirements | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetches class requirements from the class_requirements table.
 *
 * The query is only enabled when all three params (organization, element, level)
 * are truthy. Uses static caching since requirements don't change during a session.
 */
export function useClassRequirements({
  organization,
  element,
  level,
  enabled: externalEnabled = true,
}: UseClassRequirementsOptions): UseClassRequirementsResult {
  const enabled = externalEnabled && !!organization && !!element && !!level;

  const { data, isLoading, error } = useQuery<ClassRequirements | null>({
    queryKey: queryKeys.classRequirements(organization ?? '', element, level),
    queryFn: async () => {
      // class_requirements table is not in the generated Database types;
      // cast to access the table and type the response manually.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = (await (supabase as any)
        .from('class_requirements')
        .select('*')
        .eq('organization', organization)
        .eq('element', element)
        .eq('level', level)
        .maybeSingle()) as {
        data: ClassRequirements | null;
        error: { message: string } | null;
      };

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    enabled,
    ...cacheStrategies.static,
  });

  return {
    requirements: data ?? null,
    isLoading: enabled ? isLoading : false,
    error: error as Error | null,
  };
}
