import {
  ENTRY_LIST_LABELS,
  getEntryListHref,
} from '@/components/entries/management/entryManagementViews';
import type { WaitlistWaiting } from '@/features/waiting-for-you/waitlistWaiting';
import type { ClassSpotState } from '@/features/waiting-for-you/waitlistSpots';
import type { ShowDeskPendingSignal, ShowDeskPendingSignalScope } from './showDeskPendingSignals';

/**
 * What Show Desk's "waiting for you" pills read (MYK9-1949). Each is the count its list's own
 * calculation gives (`@/features/waiting-for-you`); `undefined` / `null` is "not known yet", which
 * leaves the pill out rather than showing a zero.
 */
export interface ShowDeskWaitingInput {
  heldEntries: number | undefined;
  waitlist: WaitlistWaiting | null;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The spot half of the waitlist pill. This is the place the next dog in line joins the sentence
 * later ("... · next in line: Scout"): `row.nextInLine` already carries it.
 */
function spotText(rows: readonly ClassSpotState[]): string {
  const [first] = rows;
  return rows.length === 1 && first
    ? `A spot opened in ${first.className}`
    : `Spots opened in ${rows.length} classes`;
}

function runOutText(runOut: WaitlistWaiting['runOut']): string {
  const total = runOut.reduce((sum, row) => sum + row.count, 0);
  const [first] = runOut;
  const offers = plural(total, '1 offer has', `${total} offers have`);
  return runOut.length === 1 && first
    ? `${offers} run out in ${first.className}`
    : `${offers} run out in ${runOut.length} classes`;
}

/** The held-entry and waitlist pills, each present only when something is waiting. */
export function buildWaitingSignals(
  showId: string,
  waiting: ShowDeskWaitingInput,
  scope: ShowDeskPendingSignalScope
): ShowDeskPendingSignal[] {
  const signals: ShowDeskPendingSignal[] = [];
  const held = waiting.heldEntries ?? 0;
  if (held > 0) {
    signals.push({
      id: 'entries-held',
      count: held,
      priority: 'medium',
      label: `${held} ${plural(held, 'entry', 'entries')} held for a registration number.`,
      href: getEntryListHref(showId, 'registration-needed'),
      destinationName: ENTRY_LIST_LABELS['registration-needed'],
      scope,
    });
  }
  const list = waiting.waitlist;
  if (list && list.count > 0) {
    const parts = [
      ...(list.spotClasses.length > 0 ? [spotText(list.spotClasses)] : []),
      ...(list.runOut.length > 0 ? [runOutText(list.runOut)] : []),
    ];
    signals.push({
      id: 'waitlist-waiting',
      count: list.count,
      priority: 'medium',
      label: parts.join(' · '),
      href: getEntryListHref(showId, 'waitlist'),
      destinationName: ENTRY_LIST_LABELS.waitlist,
      scope,
    });
  }
  return signals;
}
