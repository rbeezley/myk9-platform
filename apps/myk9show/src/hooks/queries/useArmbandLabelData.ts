import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { useShowVenueWifi } from './useShowVenueWifi';
import { loadServerHeldEntryIds } from '@/services/database/entries/serverHeldFlags';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { isHeldEntry, resolveDogIdentityForOrganization } from '@/features/dogs/identity';
import type { DogRegistrationLike } from '@/features/dogs/identity';
import { getTrialRegistry } from '@/features/registries';
import {
  projectHandlerIdentity,
  type HandlerPersonLike,
} from '@/features/registries/handlerIdentity';

/** Exported for unit testing — pure function, no hooks */

/** Query-key prefix of the held-entry lookup; registration changes invalidate it (MYK9-1162). */
export const ARMBAND_LABEL_HELD_ENTRIES_KEY = ['armband-label-held-entries'] as const;
export function mapEntryToArmbandLabelEntry(
  raw: Record<string, unknown>
): ArmbandLabelEntry | null {
  // `entries.armband` is a text column. Read it as a number, as the Overview does
  // (buildClassPaperworkMap), so the specific-armband filter and the print fingerprint match.
  const armband = Number(raw.armband);
  if (!Number.isFinite(armband) || armband <= 0) return null;

  const dog = raw.dog as Record<string, unknown> | null;
  const owner = dog?.owner as HandlerPersonLike | null;
  const handlerPerson = raw.handler_person as HandlerPersonLike | null;
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
    // The registration with THIS trial's registry, never another registry's or `dogs.breed`
    // (MYK9-90): a borrowed breed is worse than a blank.
    breed:
      resolveDogIdentityForOrganization(
        dog?.registrations as DogRegistrationLike[] | null | undefined,
        getTrialRegistry(trial as { registry_id?: string | null } | null).id
      ).breed ?? '',
    // The entry's handler by the same rule the check-in sheet and catalog print (MYK9-570).
    handler:
      projectHandlerIdentity({
        assignedHandlerName: raw.handler as string | null,
        assignedHandlerId: raw.handler_id as string | null,
        assignedHandlerPerson: handlerPerson,
        ownerPerson: owner,
      }).name ?? '',
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
          'id, dog_id, armband, is_day_of_show, handler, handler_id, handler_person:people!entries_handler_id_fkey(first_name, last_name), dog:dogs!inner(call_name, owner:people!dogs_owner_id_fkey(first_name, last_name), registrations:dog_registrations(id, organization, breed, is_primary, created_at)), class:classes!left(id, trial:trials!left(id, date, registry_id))'
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
  // computed server-side in the entry-results view and read every page at a time;
  // if that read fails (or the view predates the column) nothing is excluded.
  const {
    data: heldEntryIds,
    isPending: heldQueryPending,
    isFetching: heldQueryFetching,
  } = useQuery({
    queryKey: [...ARMBAND_LABEL_HELD_ENTRIES_KEY, showId],
    // The replica's held verdicts first, so a lookup that fails offline can never
    // erase holds this device already knows; the online lookup adds any newer one.
    queryFn: async () => {
      if (!showId) return [];
      const [held, replicaRows] = await Promise.all([
        loadServerHeldEntryIds([showId]),
        Promise.resolve()
          .then(() => replicatedEntriesTable.getEntriesByShow(showId))
          .catch(() => []),
      ]);
      for (const row of replicaRows) if (isHeldEntry(row)) held.add(row.id);
      return [...held];
    },
    enabled: !!showId,
    // Always re-asked when labels open: a number added or removed since the last
    // look changes which labels may print. Registration changes also invalidate it
    // (refreshRegistrationReads).
    staleTime: 0,
    refetchOnMount: 'always',
    // The lookup fails open on its own (no network: nothing held), so it must be
    // allowed to run offline. The default 'online' mode pauses it without calling
    // it, `isPending` never clears, and the labels wait on it forever.
    networkMode: 'always',
  });

  // A disabled query (no show yet) is pending forever; it holds nothing back.
  // A refetch counts as unsettled too: the cached answer it replaces may predate
  // a number being removed, so the labels wait for the current one.
  const heldPending = !!showId && (heldQueryPending || heldQueryFetching);

  const { data: venueWifi, isLoading: wifiLoading } = useShowVenueWifi(showId ?? null);

  // Labels are built only once the current held lookup has settled (answered, or
  // failed and fallen back to "nothing held"), first fetch or refetch alike, so a
  // slow or cached lookup can never let a held entry's label through.
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
