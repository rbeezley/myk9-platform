import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { TrialOfficials, UKCTrialReportOfficial } from '@/lib/reports/types';

/**
 * MYK9-1386: the show's named chairman and secretary for the reports that print
 * them (AKC Trial Chair's / Secretary's Report, UKC Trial Report). `show_officials`
 * has no replicated table, so this is the established online-only read
 * (`get_show_officials` RPC + `people`), as in `useUKCTrialReportContext`
 * (MYK9-828). Like it, an RPC/RLS failure THROWS: left as `{error}`, it would
 * resolve as a "successful" all-blank result that the cache then serves as fresh.
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

interface OfficialRow {
  user_id: string;
  role: string;
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

/** Resolve `get_show_officials` rows (already error-checked) to the two named people. */
export async function resolveTrialOfficials(rows: unknown): Promise<TrialOfficials> {
  const officials = ((rows as OfficialRow[] | null) ?? [])
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
    chairperson: chairmanRow
      ? buildOfficial(peopleById.get(chairmanRow.user_id), chairmanRow.email)
      : null,
    secretary: secretaryRow
      ? buildOfficial(peopleById.get(secretaryRow.user_id), secretaryRow.email)
      : null,
  };
}

async function fetchTrialOfficials(showId: string): Promise<TrialOfficials> {
  const officialsRead = await supabase.rpc('get_show_officials', { p_show_id: showId });
  if (officialsRead.error) throw officialsRead.error;
  return resolveTrialOfficials(officialsRead.data);
}

export function useTrialOfficials(
  showId: string | undefined,
  enabled: boolean
): UseQueryResult<TrialOfficials> {
  return useQuery({
    queryKey: ['trial-officials', showId ?? ''],
    queryFn: () => fetchTrialOfficials(showId!),
    enabled: Boolean(showId) && enabled,
    ...cacheStrategies.moderate,
  });
}
