import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { useShowVenueWifi } from './useShowVenueWifi';

/** Exported for unit testing — pure function, no hooks */
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
          'id, armband, is_day_of_show, dog:dogs!inner(call_name, owner:people!dogs_owner_id_fkey(first_name, last_name)), class:classes!left(trial:trials!left(date))'
        )
        .eq('show_id', showId)
        .is('deleted_at', null)
        .not('armband', 'is', null);
      return data ?? [];
    },
    enabled: !!showId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: venueWifi, isLoading: wifiLoading } = useShowVenueWifi(showId ?? null);

  const entries = useMemo(
    () =>
      (entriesRaw ?? [])
        .map(e => mapEntryToArmbandLabelEntry(e as Record<string, unknown>))
        .filter((e): e is ArmbandLabelEntry => e !== null),
    [entriesRaw]
  );

  return {
    entries,
    wifiNetwork: venueWifi?.venueWifiNetwork ?? null,
    wifiPassword: venueWifi?.venueWifiPassword ?? null,
    isLoading: entriesLoading || wifiLoading,
  };
}
