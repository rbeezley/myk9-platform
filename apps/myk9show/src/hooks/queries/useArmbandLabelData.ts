import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { useShowVenueWifi } from './useShowVenueWifi';

/** Exported for unit testing — pure function, no hooks */

/** Query-key prefix of the held-entry lookup; registration changes invalidate it (MYK9-1162). */
export const ARMBAND_LABEL_HELD_ENTRIES_KEY = ['armband-label-held-entries'] as const;
export function mapEntryToArmbandLabelEntry(
  raw: Record<string, unknown>
): ArmbandLabelEntry | null {
  const armband = raw.armband as number | null;
  if (!armband) return null;

  const dog = raw.dog as Record<string, unknown> | null;
  const owner = dog?.owner as Record<string, unknown> | null;
  const cls = raw.class as Record<string, unknown> | null;
  const trial = cls?.trial as Record<string, unknown> | null;

  const rawDate = (trial?.date as string) ?? '';
  const trialDate = rawDate ? formatReportDate(rawDate) : '';

  return {
    id: raw.id as string,
    dogId: (raw.dog_id as string) ?? '',
    trialId: (trial?.id as string) ?? '',
    classId: (cls?.id as string) ?? '',
    calendarDay: rawDate,
    armband,
    callName: (dog?.call_name as string) ?? '',
    handler: owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : '',
    trialDate,
    isDayOfShow: (raw.is_day_of_show as boolean) ?? false,
  };
}

export interface ArmbandLabelDataResult {
  entries: ArmbandLabelEntry[];
  wifiNetwork: string | null;
  wifiPassword: string | null;
  isLoading: boolean;
}

export function useArmbandLabelData(showId: string | undefined): ArmbandLabelDataResult {
  const { data: entriesRaw, isLoading: entriesLoading } = useQuery({
    queryKey: ['armband-label-entries', showId],
    queryFn: async () => {
      if (!showId) return [];
      const { data } = await supabase
        .from('entries')
        .select(
          'id, dog_id, armband, is_day_of_show, dog:dogs!inner(call_name, owner:people!dogs_owner_id_fkey(first_name, last_name)), class:classes!left(id, trial:trials!left(id, date))'
        )
        .eq('show_id', showId)
        .is('deleted_at', null)
        .not('armband', 'is', null);
      return data ?? [];
    },
    enabled: !!showId,
    staleTime: 2 * 60 * 1000,
  });

  // MYK9-1162: no label for an entry awaiting a registration number. The flag is
  // computed server-side in the entry-results view; if that read fails (or the
  // view predates the column) nothing is excluded, so labels are never withheld.
  const { data: heldEntryIds, isPending: heldQueryPending } = useQuery({
    queryKey: [...ARMBAND_LABEL_HELD_ENTRIES_KEY, showId],
    queryFn: async () => {
      if (!showId) return [];
      const { data, error } = await supabase
        .from('view_authenticated_entry_results')
        .select('id')
        .eq('show_id', showId)
        .filter('awaiting_registration_number', 'eq', true);
      return error ? [] : (data ?? []).map(row => String(row.id));
    },
    enabled: !!showId,
    // Always re-asked when labels open: a number added or removed since the last
    // look changes which labels may print. Registration changes also invalidate it
    // (refreshRegistrationReads).
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // A disabled query (no show yet) is pending forever; it holds nothing back.
  const heldPending = !!showId && heldQueryPending;

  const { data: venueWifi, isLoading: wifiLoading } = useShowVenueWifi(showId ?? null);

  // Labels are built only once the held lookup has settled (answered, or failed
  // and fallen back to "nothing held"), so a slow lookup can never let a held
  // entry's label through.
  const entries = useMemo(
    () =>
      heldPending
        ? []
        : (entriesRaw ?? [])
            .map(e => mapEntryToArmbandLabelEntry(e as Record<string, unknown>))
            .filter((e): e is ArmbandLabelEntry => e !== null)
            .filter(e => !heldEntryIds?.includes(e.id)),
    [entriesRaw, heldEntryIds, heldPending]
  );

  return {
    entries,
    wifiNetwork: venueWifi?.venueWifiNetwork ?? null,
    wifiPassword: venueWifi?.venueWifiPassword ?? null,
    isLoading: entriesLoading || wifiLoading || heldPending,
  };
}
