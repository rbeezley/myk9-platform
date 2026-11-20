import {
  ENTRY_LIST_LABELS,
  getEntryListHref,
} from '@/components/entries/management/entryManagementViews';
import { currentCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import type { WaitlistWaiting } from '@/features/waiting-for-you/waitlistWaiting';
import type { ShowDeskPendingSignal, ShowDeskPendingSignalScope } from './showDeskPendingSignals';

/**
 * What Show Desk's "waiting for you" pills read (MYK9-1949). Each is the count its list's own
 * calculation gives (`@/features/waiting-for-you`); `undefined` / `null` is "not known yet", which
 * leaves the pill out rather than showing a zero.
 */
export interface ShowDeskWaitingInput {
  heldEntries: number | undefined;
  waitlist: WaitlistWaiting | null;
  /**
   * MYK9-2099: `findEntryRefundsToDecide`'s count, the Pulls menu count, and the show's payout
   * day (`computeSettleDate`, `YYYY-MM-DD`; null when the show has no end date).
   */
  refundsToDecide?:
    | {
        count: number;
        payoutDate: string | null;
        timeZone?: string | null | undefined;
        /**
         * MYK9-2172: true only when the payout brake is known to be off, so the payout really goes
         * on `payoutDate`. Absent or false: the date is only the earliest it can go.
         */
        payoutDateIsExact?: boolean | undefined;
      }
    | undefined;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "before Thursday's payout": the payout day in words. The payout DATE is a calendar day
 * (`computeSettleDate`); "today" is read on the show's own calendar, so a US evening does not
 * already count as tomorrow. A weekday names a calendar date, so it needs no zone. A payout a week
 * or more away is named by its date; one already past, or unknown, is not mentioned.
 *
 * MYK9-2172: unless `exact`, the payout brake may keep the payout waiting past that day, so the
 * day is named as the earliest the payout can go, never as the day it goes.
 */
export function payoutDayText(
  payoutDate: string | null,
  now: Date | null | undefined,
  timeZone?: string | null,
  exact = false
): string {
  if (!payoutDate || !/^\d{4}-\d{2}-\d{2}$/.test(payoutDate)) return '';
  const payout = new Date(`${payoutDate}T12:00:00Z`);
  const today = new Date(`${currentCalendarDate(now ?? new Date(), timeZone)}T12:00:00Z`);
  const days = Math.round((payout.getTime() - today.getTime()) / DAY_MS);
  if (Number.isNaN(days) || days < 0) return '';
  if (days === 0)
    return exact ? " before today's payout" : ' before the payout (as early as today)';
  if (days < 7) {
    const weekday = payout.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    return exact ? ` before ${weekday}'s payout` : ` before the payout (as early as ${weekday})`;
  }
  const date = payout.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return exact ? ` before the ${date} payout` : ` before the payout (as early as ${date})`;
}

/** `total` is the run-out offers' count, as the list gave it. */
function runOutText(runOut: WaitlistWaiting['runOut'], total: number): string {
  const [first] = runOut;
  const offers = plural(total, '1 offer has', `${total} offers have`);
  return runOut.length === 1 && first
    ? `${offers} run out in ${first.className}`
    : `${offers} run out in ${runOut.length} classes`;
}

function openSpotText(openSpots: WaitlistWaiting['openSpots']): string {
  const [first] = openSpots;
  if (openSpots.length === 1 && first) {
    return `A spot opened in ${first.className}${
      first.nextDogName ? ` · next in line: ${first.nextDogName}` : ''
    }`;
  }
  return `Spots opened in ${openSpots.length} classes`;
}

/** The refund, held-entry and waitlist pills, each present only when something is waiting. */
export function buildWaitingSignals(
  showId: string,
  waiting: ShowDeskWaitingInput,
  scope: ShowDeskPendingSignalScope,
  now?: Date | null
): ShowDeskPendingSignal[] {
  const signals: ShowDeskPendingSignal[] = [];
  const refunds = waiting.refundsToDecide;
  if (refunds && refunds.count > 0) {
    signals.push({
      id: 'refunds-to-decide',
      count: refunds.count,
      priority: 'medium',
      label: `${refunds.count} ${plural(refunds.count, 'refund', 'refunds')} to decide${payoutDayText(
        refunds.payoutDate,
        now,
        refunds.timeZone,
        refunds.payoutDateIsExact === true
      )}`,
      href: getEntryListHref(showId, 'pulls'),
      destinationName: ENTRY_LIST_LABELS.pulls,
      scope,
    });
  }
  const held = waiting.heldEntries ?? 0;
  if (held > 0) {
    signals.push({
      id: 'entries-held',
      count: held,
      priority: 'medium',
      label: `${held} ${plural(held, 'entry', 'entries')} held for a registration number`,
      href: getEntryListHref(showId, 'registration-needed'),
      destinationName: ENTRY_LIST_LABELS['registration-needed'],
      scope,
    });
  }
  const list = waiting.waitlist;
  if (list && list.count > 0) {
    signals.push({
      id: 'waitlist-waiting',
      count: list.count,
      priority: 'medium',
      label: [
        list.openSpots.length > 0 ? openSpotText(list.openSpots) : null,
        list.runOut.length > 0 ? runOutText(list.runOut, list.count - list.openSpots.length) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: getEntryListHref(showId, 'waitlist'),
      destinationName: ENTRY_LIST_LABELS.waitlist,
      scope,
    });
  }
  return signals;
}
