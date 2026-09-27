import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { UKCTrialReportContext, UKCTrialReportOfficial } from '@/lib/reports/types';

/**
 * MYK9-828: the UKC Trial Report's Event Chairperson / Event Secretary blocks,
 * and its City/State/Club ID fields, are not on `ReportProps.trial` or `Show`
 * — they need a show/club/officials/people read of their own. This is
 * online-only (like `useEntryFormData`'s secretary read): a failed or offline
 * read leaves these fields blank on the printed form rather than the whole
 * report failing.
 */

interface PersonRow {
  first_name: string | null;
  last_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  email: string | null;
}

function buildOfficial(
  person: PersonRow | undefined,
  fallbackEmail: string | null
): UKCTrialReportOfficial | null {
  if (!person) return null;
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  if (!name) return null;

  return {
    name,
    streetAddress: person.street_address,
    city: person.city,
    state: person.state,
    zipCode: person.zip_code,
    phone: person.phone,
    email: person.email ?? fallbackEmail,
  };
}

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
    const clubRead = await supabase
      .from('clubs')
      .select('club_number')
      .eq('id', clubId)
      .maybeSingle();
    if (clubRead.error) throw clubRead.error;
    clubNumber = (clubRead.data as { club_number: string | null } | null)?.club_number ?? null;
  }

  const officials = (
    (officialsRead.data as Array<{ user_id: string; role: string; email: string | null }> | null) ??
    []
  )
    // The RPC carries no ordering and a show can name more than one person per
    // role; sort so repeated downloads print the SAME official rather than
    // whichever row Postgres happened to return first.
    .slice()
    .sort((a, b) => a.user_id.localeCompare(b.user_id));
  const chairmanRow = officials.find(o => o.role === 'chairman');
  const secretaryRow = officials.find(o => o.role === 'secretary');
  const personIds = [chairmanRow?.user_id, secretaryRow?.user_id].filter((id): id is string =>
    Boolean(id)
  );

  let peopleRaw: Array<PersonRow & { id: string }> = [];
  if (personIds.length > 0) {
    const peopleRead = await supabase
      .from('people')
      .select('id, first_name, last_name, street_address, city, state, zip_code, phone, email')
      .in('id', personIds);
    if (peopleRead.error) throw peopleRead.error;
    peopleRaw = peopleRead.data ?? [];
  }

  const peopleById = new Map(peopleRaw.map(p => [p.id, p]));

  return {
    venueCity: (showRead.data as { city: string | null } | null)?.city ?? null,
    venueState: (showRead.data as { state: string | null } | null)?.state ?? null,
    clubNumber,
    chairperson: chairmanRow
      ? buildOfficial(peopleById.get(chairmanRow.user_id), chairmanRow.email)
      : null,
    secretary: secretaryRow
      ? buildOfficial(peopleById.get(secretaryRow.user_id), secretaryRow.email)
      : null,
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
