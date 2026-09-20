import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEntriesByShowFromReplication } from '@/services/database/entries';
import { getTrialsByShow } from '@/services/database/trials';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { useShowVenueWifi } from './useShowVenueWifi';
import { projectHandlerIdentity } from '@/features/registries/handlerIdentity';
import { normalizePacketArmband } from '@/features/emergency-trial-packet/armband';

/** Exported for unit testing — pure function, no hooks */
export function mapEntryToArmbandLabelEntry(
  raw: Record<string, unknown>
): ArmbandLabelEntry | null {
  const armband = normalizePacketArmband(raw.armband as number | string | null | undefined);
  if (!armband) return null;

  const dog = raw.dog as Record<string, unknown> | null;
  const owner = dog?.owner as Record<string, unknown> | null;
  const cls = raw.class as Record<string, unknown> | null;
  const trial = cls?.trial as Record<string, unknown> | null;

  const classId = (cls?.id as string) ?? (raw.class_id as string) ?? '';
  const trialId =
    (trial?.id as string) ??
    (cls?.trial_id as string) ??
    (raw.trial_id as string) ??
    (raw.trialId as string) ??
    '';
  const rawDate =
    (trial?.date as string) ?? (raw.trial_date as string) ?? (raw.trialDate as string) ?? '';
  const trialDate = rawDate ? formatReportDate(rawDate) : '';
  const handlerIdentity = projectHandlerIdentity({
    assignedHandlerName: raw.handler as string | null | undefined,
    assignedHandlerId: raw.handler_id as string | null | undefined,
    assignedHandlerPerson: raw.handler_person as Record<string, string | null> | null,
    ownerPerson: owner as Record<string, string | null> | null,
  });

  return {
    id: raw.id as string,
    dogId: (raw.dog_id as string) ?? '',
    trialId,
    classId,
    calendarDay: rawDate,
    armband,
    callName: (dog?.call_name as string) ?? '',
    handler: handlerIdentity.name ?? (raw.handler_id ? 'Unknown Handler' : ''),
    trialDate,
    isDayOfShow: (raw.is_day_of_show as boolean) ?? false,
    handlerIdentity: {
      id: (raw.handler_id as string | null | undefined)?.trim() || null,
      name: handlerIdentity.name,
      source: handlerIdentity.source,
    },
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
      const [{ data: entries, error: entriesError }, { data: trials, error: trialsError }] =
        await Promise.all([getEntriesByShowFromReplication(showId), getTrialsByShow(showId)]);
      if (entriesError) throw entriesError;
      if (trialsError) throw trialsError;
      const trialsById = new Map((trials ?? []).map(trial => [trial.id, trial] as const));
      return (entries ?? []).map(entry => {
        const row = entry as Record<string, unknown>;
        const cls = row.class as Record<string, unknown> | null;
        const trialId =
          (cls?.trial_id as string | undefined) ??
          (row.trial_id as string | undefined) ??
          (row.trialId as string | undefined);
        return {
          ...row,
          class:
            cls || trialId
              ? {
                  ...(cls ?? {}),
                  ...(trialId ? { trial_id: trialId } : {}),
                  trial: trialId ? (trialsById.get(trialId) ?? null) : null,
                }
              : null,
        };
      });
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
