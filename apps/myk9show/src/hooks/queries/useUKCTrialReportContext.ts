import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { UKCTrialReportContext } from '@/lib/reports/types';
import { resolveTrialOfficials } from './useTrialOfficials';

/**
 * MYK9-828: the UKC Trial Report's Event Chairperson / Event Secretary blocks,
 * and its City/State/Club ID fields, are not on `ReportProps.trial` or `Show`
 * — they need a show/club/officials/people read of their own. This is
 * online-only (like `useEntryFormData`'s secretary read): a failed or offline
 * read leaves these fields blank on the printed form rather than the whole
 * report failing.
 */

async function fetchUKCTrialReportContext(showId: string): Promise<UKCTrialReportContext> {
  const [showRead, officialsRead] = await Promise.all([
    supabase.from('shows').select('city, state, club_id').eq('id', showId).maybeSingle(),
    supabase.rpc('get_show_officials', { p_show_id: showId }),
  ]);
  // MYK9-828 review: supabase-js reports a network/RLS/RPC failure as
  // `{error}`, not a throw. Left unchecked, a transient failure resolves as a
  // "successful" all-blank context, React Query never retries it, and
  // `cacheStrategies.moderate` serves that blank result as fresh for 5
  // minutes — the exact "valid, empty form read as fact" failure
  // `useEntryFormData`'s `throwIfUnread` exists to prevent.
  if (showRead.error) throw showRead.error;
  if (officialsRead.error) throw officialsRead.error;

  const clubId = (showRead.data as { club_id: string | null } | null)?.club_id ?? null;
  let clubNumber: string | null = null;
  if (clubId) {
    // MYK9-1235: the UKC form prints the club's UKC number specifically.
    const clubRead = await supabase
      .from('club_registry_numbers')
      .select('number')
      .eq('club_id', clubId)
      .eq('organization', 'UKC')
      .maybeSingle();
    if (clubRead.error) throw clubRead.error;
    clubNumber = (clubRead.data as { number: string } | null)?.number ?? null;
  }

  const officials = await resolveTrialOfficials(officialsRead.data);

  return {
    venueCity: (showRead.data as { city: string | null } | null)?.city ?? null,
    venueState: (showRead.data as { state: string | null } | null)?.state ?? null,
    clubNumber,
    ...officials,
  };
}

export function useUKCTrialReportContext(
  showId: string | undefined,
  enabled: boolean
): UseQueryResult<UKCTrialReportContext> {
  return useQuery({
    queryKey: ['ukc-trial-report-context', showId ?? ''],
    queryFn: () => fetchUKCTrialReportContext(showId!),
    enabled: Boolean(showId) && enabled,
    ...cacheStrategies.moderate,
  });
}
