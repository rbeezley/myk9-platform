/**
 * The "refunds to decide" line of the Finish the show list (MYK9-2427).
 *
 * `whatIsLeft.ts` counts the refunds; this file words and links the line and says when the
 * club's payout runs, so the secretary decides each refund before the money goes out.
 *
 * The note states the promise in words, never a computed date. The show's end date on this device
 * is a replicated copy that another device may have rescheduled, and no freshness signal for the
 * row itself exists here; three review rounds on a dated note each found a new way the copy could
 * be stale (PR #4509). The club's Payments tab is where the dated schedule lives.
 */
import { getEntryListHref } from '@/components/entries/management/entryManagementViews';
import type { FinishListItem } from './finishList';
import type { WhatIsLeftLine } from './whatIsLeft';

// Wording states the promise only, never that a transfer is pending: an open refund does not
// establish payout status (MYK9-2427 review).
export const REFUND_PAYOUT_NOTE =
  "Your club's payout is promised within five business days of the show's last day.";

/** Listed while a refund waits or cannot be read; nothing left is not listed. */
export function refundFinishItem(showId: string, line: WhatIsLeftLine): FinishListItem | null {
  if (line.open === false) return null;
  if (line.open === null) {
    return {
      key: line.key,
      state: 'unknown',
      opensClassList: false,
      href: null,
      label: line.label,
    };
  }
  return {
    key: line.key,
    state: 'open',
    opensClassList: false,
    href: getEntryListHref(showId, 'pulls'),
    label: line.label,
    note: REFUND_PAYOUT_NOTE,
  };
}
