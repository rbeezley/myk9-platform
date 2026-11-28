/**
 * The "refunds to decide" line of the Finish the show list (MYK9-2427).
 *
 * `whatIsLeft.ts` counts the refunds; this file words and links the line and says when the
 * club's payout runs, so the secretary decides each refund before the money goes out. The date is
 * `payoutDeadline.ts`'s, the one copy of the five-business-day promise, formatted the way the
 * club's Payments tab formats it.
 */
import { getEntryListHref } from '@/components/entries/management/entryManagementViews';
import { payoutTimeline } from '@/features/payments/payoutDeadline';
import { formatPayoutDay } from '@/features/payments/payoutStage';
import type { FinishListItem } from './finishList';
import type { WhatIsLeftLine } from './whatIsLeft';

/** The show's last day and zone, so the line can date the payout. `lastDay` null = no date known. */
export interface FinishListPayoutSchedule {
  lastDay: string | null;
  timeZone: string;
  /** The clock, for a test; defaults to now. */
  now?: Date;
}

const PROMISE_IN_WORDS =
  "Decide these before your club's payout. It is sent within five business days of the show's last day.";

function payoutNote(schedule: FinishListPayoutSchedule | undefined): string {
  const timeline = schedule
    ? payoutTimeline(schedule.lastDay, schedule.timeZone, schedule.now ?? new Date())
    : null;
  if (!timeline) return PROMISE_IN_WORDS;
  const due = formatPayoutDay(timeline.dueDate, timeline.today);
  return timeline.pastDue
    ? `Your club's payout was due ${due}. Decide these now so it can go out.`
    : `Decide these before your club's payout. It is sent by ${due}.`;
}

/** Listed while a refund waits or cannot be read; nothing left is not listed. */
export function refundFinishItem(
  showId: string,
  line: WhatIsLeftLine,
  schedule: FinishListPayoutSchedule | undefined
): FinishListItem | null {
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
    note: payoutNote(schedule),
  };
}
