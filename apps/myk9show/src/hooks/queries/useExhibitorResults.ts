/**
 * Hook for fetching scored results for the current user's dogs.
 * Queries the authenticated result view for own entries that have been scored.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { cacheStrategies } from '@/lib/queryClient';
import { viewerScope } from '@/lib/viewerScopedQueryKey';
import { useViewerId } from '@/hooks/useViewerId';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import type { ResultStatus } from '@/components/common/ResultBadge';

export interface ExhibitorResult {
  id: string;
  dogId: string;
  dogName: string;
  dogCallName: string;
  showId: string;
  classId: string;
  trialId?: string | null;
  className: string;
  classLevel: string | null;
  classElement: string | null;
  resultText: 'Q' | 'NQ' | 'ABS' | 'EX' | 'DQ' | 'WD' | 'pending';
  resultStatus: ResultStatus;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
  scoringCompletedAt: string | null;
  showName: string;
  showDate: string;
  /** MYK9-263/MYK9-805: null/absent until the secretary releases the class —
   *  placement stays withheld and the result reads "preliminary" until then.
   *  Optional so hand-built fixtures that predate the release check keep
   *  compiling; the mapper below always sets it on a real query result. */
  resultsReleasedAt?: string | null;
}

const PAGE_SIZE = 1000;
/** Live-ish refresh for an open dog page. React Query skips ticks on a hidden
 *  tab (refetchIntervalInBackground: false) and parks them offline
 *  (networkMode: 'online'); both are set explicitly below. */
const OPEN_DOG_PAGE_POLL_MS = 30_000;

async function fetchExhibitorResults(dogIds: string[]) {
  if (dogIds.length === 0) return [];

  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('view_authenticated_entry_results')
      .select(
        `
      id,
      dog_id,
      dog_name,
      dog_call_name,
      show_id,
      class_id,
      trial_id,
      class_name,
      class_level,
      class_element,
      result_text,
      result_status,
      search_time_seconds,
      total_faults,
      final_placement,
      scoring_completed_at,
      show_name,
      show_start_date,
      class_results_released_at
    `
      )
      .in('dog_id', dogIds)
      .eq('is_scored', true)
      .order('scoring_completed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  // The result view names the show start date, which can precede this trial
  // by several days. Resolve actual trial dates before publishing the history.
  const trialIds = [
    ...new Set(rows.map(row => row.trial_id).filter((id): id is string => typeof id === 'string')),
  ];
  const trialDates = new Map<string, string>();
  for (let from = 0; from < trialIds.length; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('trials')
      .select('id, date')
      .in('id', trialIds.slice(from, from + PAGE_SIZE));
    if (error) throw error;
    for (const trial of data ?? []) trialDates.set(trial.id, trial.date);
  }

  return rows.map((row: Record<string, unknown>): ExhibitorResult => ({
    id: row.id as string,
    dogId: row.dog_id as string,
    dogName: row.dog_name as string,
    dogCallName: (row.dog_call_name as string) || (row.dog_name as string),
    showId: row.show_id as string,
    classId: row.class_id as string,
    trialId: row.trial_id as string | null,
    className: (row.class_name as string) || 'Unknown Class',
    classLevel: row.class_level as string | null,
    classElement: row.class_element as string | null,
    resultText: row.result_text as ExhibitorResult['resultText'],
    resultStatus: row.result_status as ResultStatus,
    searchTimeSeconds: row.search_time_seconds as number | null,
    totalFaults: row.total_faults as number | null,
    finalPlacement: row.final_placement as number | null,
    scoringCompletedAt: row.scoring_completed_at as string | null,
    showName: (row.show_name as string) || 'Unknown Show',
    // A trial row the viewer cannot read must not blank the date: fall back to
    // the show start date. '' means no date is known at all; date parsers
    // downstream (titles, stats) need a date or '', so the view labels that
    // case itself (PastResultsSection).
    showDate:
      (row.trial_id ? trialDates.get(row.trial_id as string) : undefined) ||
      (row.show_start_date as string) ||
      '',
    resultsReleasedAt: (row.class_results_released_at as string | null) ?? null,
  }));
}

/**
 * Fetches scored results for dogs owned by the current user. A title card can
 * narrow this to one dog without loading every owned dog's career history.
 * Returns results ordered by most recent scoring date.
 *
 * The viewer is read here rather than passed in, unlike `useMyPayments`. These
 * results reach the UI through `useTitleProgress` and
 * `usePerformanceStatistics` and then through half a dozen dog cards, none of
 * which has any other use for an account id; threading a security argument
 * through that many presentational components is more forgettable, not less.
 * Reading it inside the hook means no caller can omit it at all (MYK9-429).
 */
export function useExhibitorResults(dogId?: string) {
  const viewerId = useViewerId();
  const dogsQuery = useDogsQuery();
  const profileQuery = useExhibitorProfile();
  const dogs = dogsQuery.data ?? [];
  const dogIds = dogs
    .map((d: Record<string, unknown>) => d.id as string)
    .filter(id => dogId === undefined || id === dogId);
  const sortedIds = dogIds.slice().sort();

  const resultsQuery = useQuery({
    queryKey: ['exhibitor', 'results', viewerScope(viewerId), sortedIds],
    queryFn: () => fetchExhibitorResults(dogIds),
    enabled: dogIds.length > 0,
    ...cacheStrategies.moderate,
    networkMode: 'online',
    ...(dogId
      ? {
          staleTime: 0,
          refetchOnMount: 'always' as const,
          refetchInterval: OPEN_DOG_PAGE_POLL_MS,
          refetchIntervalInBackground: false,
        }
      : {}),
  });
  // A roster that is pending but neither loading nor fetching is either
  // disabled (waiting on the owner profile: still loading) or paused/offline
  // (Retry). Only the profile query's own loading state tells them apart.
  const rosterIdle =
    dogsQuery.isPending && !dogsQuery.isLoading && dogsQuery.fetchStatus !== 'fetching';
  const rosterAwaitingProfile = rosterIdle && profileQuery.isLoading;
  const rosterUnavailable = rosterIdle && !rosterAwaitingProfile;
  const resultsUnavailable =
    dogIds.length > 0 && resultsQuery.isPending && resultsQuery.fetchStatus === 'paused';

  return {
    ...resultsQuery,
    // A disabled result query is idle, not proof that the dog has no scores.
    isLoading: dogsQuery.isLoading || rosterAwaitingProfile || resultsQuery.isLoading,
    isError: dogsQuery.isError || resultsQuery.isError || rosterUnavailable || resultsUnavailable,
    retry: async () => {
      if (dogsQuery.isError || rosterUnavailable) {
        await dogsQuery.refetch();
      } else {
        await resultsQuery.refetch();
      }
    },
  };
}
