import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClubRegistryNumbers } from '@/hooks/queries/useClubRegistryNumbers';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { queryKeys } from '@/lib/queryClient';
import { saveClubRegistryNumbers } from '@/services/database/clubs';
import {
  CLUB_NUMBER_REQUIRED_MESSAGE,
  formatClubRegistryNumbers,
  hasClubRegistryNumber,
  type ClubRegistryNumberInputs,
  type ClubRegistryOrg,
} from '@/utils/clubRegistryNumbers';

/**
 * MYK9-2365 (was MYK9-1235's separate dialog): the club's AKC / UKC / ASCA numbers inside the
 * Edit Club panel. The numbers are online-only data (club_registry_numbers), so they are read
 * and written here, apart from the offline-first club save, and the panel's save runs the two
 * as separate steps so it can say which part saved.
 *
 * Fields show the stored numbers until the user types in them. Only typed fields are kept as
 * edits; every other field follows the loaded numbers, so a background refresh updates the
 * untouched fields and a save never writes a stale snapshot back.
 */
export type ClubNumbersStatus = 'off' | 'loading' | 'failed' | 'unavailable' | 'ready';

export interface ClubNumbersDraft {
  status: ClubNumbersStatus;
  values: ClubRegistryNumberInputs;
  /** Fields can be typed in: the numbers loaded and the device is online. */
  editable: boolean;
  /** The loaded numbers are showing but the device is offline. */
  offline: boolean;
  /** A refresh failed after the numbers had loaded; typed edits are kept. */
  refreshFailed: boolean;
  /** Typed values differ from the stored numbers. */
  dirty: boolean;
  error: string | null;
  setValue: (org: ClubRegistryOrg, value: string) => void;
  retry: () => void;
  /** Drops the typed changes, back to the stored numbers. */
  reset: () => void;
  /** False (and sets the error) when a club that has a number would be left with none. */
  validate: () => boolean;
  /** Writes the typed fields. Throws when the write fails. */
  persist: () => Promise<void>;
}

export function useClubNumbersDraft(clubId: string, enabled: boolean): ClubNumbersDraft {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const {
    data: loaded,
    isLoading,
    isError,
    refetch,
  } = useClubRegistryNumbers(enabled ? clubId : undefined);
  const [edits, setEdits] = useState<Partial<ClubRegistryNumberInputs>>({});
  const [error, setError] = useState<string | null>(null);

  const values: ClubRegistryNumberInputs = {
    AKC: edits.AKC ?? loaded?.AKC ?? '',
    UKC: edits.UKC ?? loaded?.UKC ?? '',
    ASCA: edits.ASCA ?? loaded?.ASCA ?? '',
  };

  // No data that is neither loading nor an error is a paused (offline) read, never proof the
  // club has no numbers.
  const status: ClubNumbersStatus = !enabled
    ? 'off'
    : loaded
      ? 'ready'
      : isLoading
        ? 'loading'
        : isError
          ? 'failed'
          : 'unavailable';

  const dirty =
    Boolean(loaded) && formatClubRegistryNumbers(values) !== formatClubRegistryNumbers(loaded);

  return {
    status,
    values,
    editable: status === 'ready' && isOnline,
    offline: status === 'ready' && !isOnline,
    refreshFailed: status === 'ready' && isError,
    dirty,
    error,
    setValue: (org, value) => {
      setEdits(previous => ({ ...previous, [org]: value }));
      setError(null);
    },
    retry: () => void refetch(),
    reset: () => {
      setEdits({});
      setError(null);
    },
    validate: () => {
      // A club that has a number keeps at least one.
      if (hasClubRegistryNumber(loaded) && !hasClubRegistryNumber(values)) {
        setError(CLUB_NUMBER_REQUIRED_MESSAGE);
        return false;
      }
      return true;
    },
    persist: async () => {
      // Only the fields the user typed in; every other organization stays as stored.
      await saveClubRegistryNumbers(clubId, edits);
      await queryClient.invalidateQueries({ queryKey: queryKeys.clubRegistryNumbers(clubId) });
      setEdits({});
    },
  };
}
