import { useMemo } from 'react';
import { useRegistrationNeededEntries } from '@/hooks/useRegistrationNeededEntries';
import { computeSettleDate } from '@/features/payments/payoutLedger';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useWaitlistWaiting } from './useWaitlistWaiting';
import { findEntryRefundsToDecide } from './refundsToDecide';
import type { ShowDeskWaitingInput } from '@/features/show-map/showDeskWaitingSignals';

/**
 * Everything Show Desk's "waiting for you" pills read, each from its one calculation. A field is
 * `undefined` (or `null` for the waitlist) while it is not known, and the pill is then left out
 * rather than shown as a zero.
 */
export function useShowDeskWaiting(input: {
  showId: string;
  entries: ReadonlyMap<string, EntryManagementEntry> | undefined;
  /**
   * `shows.end_date`: a payout can go three days after it at the earliest (`computeSettleDate`).
   * That day is eligibility, not a promise (MYK9-2172).
   */
  showEndDate?: string | null | undefined;
  /** The show's calendar (its trials' IANA zone), for "today" in the payout wording. */
  timeZone?: string | null | undefined;
  /** The viewer manages the show; otherwise nothing is read. */
  enabled: boolean;
}): ShowDeskWaitingInput {
  const { showId, entries, showEndDate, timeZone, enabled } = input;
  const list = useMemo(() => (entries ? [...entries.values()] : []), [entries]);
  const held = useRegistrationNeededEntries(showId, list);
  const waitlist = useWaitlistWaiting(showId, enabled);
  // The Pulls menu count is this same call over the same entries (MYK9-2099).
  const refunds = useMemo(() => findEntryRefundsToDecide(list), [list]);
  // Saved decisions not read: the count could include a refund already denied, so no pill claims
  // it (MYK9-2099). The Pulls list says the decisions did not load.
  const refundsKnown = entries !== undefined && refunds.decisionsUnknown === 0;
  return {
    heldEntries: entries ? held.count : undefined,
    waitlist,
    refundsToDecide: refundsKnown
      ? {
          count: refunds.count,
          payoutDate: computeSettleDate(showEndDate ?? null),
          timeZone: timeZone ?? null,
        }
      : undefined,
  };
}
