import { useMemo } from 'react';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { findEntriesAwaitingRegistrationNumber } from '@/components/entries/management/registrationNeeded';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * The entries awaiting a registration number, for the Entries cockpit's
 * "Registration number needed" view (MYK9-1162).
 *
 * Reads only what the cockpit and the device already hold: the page's loaded
 * entries (each carrying the server's held flag), the show's trials (for the
 * registry to name) and the replica-backed dog roster (for the Add registration
 * action). No read of its own, so it works offline. `count` is undefined
 * until the trials and roster have both loaded, so the menu shows no badge
 * rather than a confident 0.
 */
export function useRegistrationNeededEntries(
  showId: string | null,
  entries: readonly EntryManagementEntry[]
) {
  const trialsQuery = useShowTrials(showId);
  const { dogs, isReady: dogsReady, rosterError, refetch: refetchDogs } = useDogStoreCompat();
  // The trials read is untyped rows; narrow to the two fields the rule reads.
  const trials = useMemo(
    () =>
      trialsQuery.data?.map(trial => ({
        id: String(trial.id),
        registry_id: typeof trial.registry_id === 'string' ? trial.registry_id : null,
      })),
    [trialsQuery.data]
  );

  const rows = useMemo(
    () =>
      trials && dogsReady ? findEntriesAwaitingRegistrationNumber({ entries, trials, dogs }) : [],
    [dogs, dogsReady, entries, trials]
  );
  const isReady = Boolean(trials) && dogsReady;
  // A failed prerequisite is its own state, never "still loading": the pane shows
  // its error card with a Retry instead of a skeleton that never ends.
  const isError = !isReady && (trialsQuery.isError || Boolean(rosterError));
  const retry = () => {
    void trialsQuery.refetch();
    void refetchDogs();
  };

  return { rows, isReady, isError, retry, count: isReady ? rows.length : undefined };
}
