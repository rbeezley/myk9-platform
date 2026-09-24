import { useMemo } from 'react';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type { StoreShow } from '@/types/show-types';
import { useEntryWindowTimezone } from '@/hooks/useEntryWindowTimezone';
import { getEntryCloseAvailability, type EntryCloseAvailability } from './entryCloseGuard';

export interface EntryCloseAvailabilityInput {
  showId: string;
  show: Pick<StoreShow, 'startDate' | 'entryOpenDate' | 'entryCloseDate'> | undefined;
  isLateEntryMode: boolean;
  workflowMode: WorkflowMode;
}

/**
 * The wizard's entry-open / entry-close gate, decided in the show's own
 * entry-window zone (MYK9-676).
 *
 * `submit_show_entries` compares `now() AT TIME ZONE <first trial's zone>`
 * with the close DATE. This gate used to read the zone from the show store's
 * `trials`, which was always `[]`, so it decided in America/New_York for every
 * show: an exhibitor at a Central-time show was refused from 23:00 CT on close
 * day while the server would still accept them. The zone now comes from the
 * trial store through `useEntryWindowTimezone`, the same source as the fee tier.
 *
 * While that zone is not yet known the hook answers with its documented
 * fallback; the Payment submit is separately refused until `isReady`.
 */
export function useEntryCloseAvailability({
  showId,
  show,
  isLateEntryMode,
  workflowMode,
}: EntryCloseAvailabilityInput): EntryCloseAvailability {
  const { timeZone } = useEntryWindowTimezone(showId);
  const startDate = show?.startDate;
  const entryOpenDate = show?.entryOpenDate;
  const entryCloseDate = show?.entryCloseDate;

  return useMemo(
    () =>
      getEntryCloseAvailability({
        showId,
        startDate,
        entryOpenDate,
        entryCloseDate,
        entryWindowTimezone: timeZone,
        isLateEntryMode,
        workflowMode,
      }),
    [showId, startDate, entryOpenDate, entryCloseDate, timeZone, isLateEntryMode, workflowMode]
  );
}
