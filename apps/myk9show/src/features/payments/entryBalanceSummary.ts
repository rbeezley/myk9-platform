import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { mapEntryStatus, mapPaymentStatus } from '@/utils/entryManagementUtils';
import { parseShowDate } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import { buildFinishPaymentHref } from './finishPaymentHref';
import { getTrialTimezone } from '@/features/registries';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';
import { DEFAULT_SHOW_TIMEZONE, toEntryCloseDay } from './entryCloseDeadline';
import { getEntryPaymentPrompt } from './entryPaymentPrompt';

export interface EntryBalanceClassSource {
  id: string;
}

export interface EntryBalanceSource {
  id: string;
  showId: string;
  showName?: string | null;
  showDate: Date;
  showEndDate?: Date | undefined;
  /**
   * The show's entry-close day as a bare `YYYY-MM-DD` calendar day, or `null`
   * when the show has none. NOT a Date: see `./entryCloseDeadline` for why the
   * day is carried as a string rather than an instant.
   */
  entryCloseDay?: string | null | undefined;
  /**
   * IANA timezone the show's calendar days are reckoned in. The entry-close
   * guard decides "closed" in this zone, not the viewer's, so the deadline
   * copy must too.
   */
  showTimezone?: string | undefined;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string | null | undefined;
  /** Fee in dollars, matching My Entries' loaded entry model. */
  totalFee: number;
  classes?: EntryBalanceClassSource[] | undefined;
}

export interface EntryBalanceShowSummary {
  showId: string;
  showName: string;
  /**
   * Entry-close day for this show (`YYYY-MM-DD`), or `null` when unknown.
   * Required rather than optional so a new caller has to decide what it knows
   * instead of silently rendering a balance with no deadline.
   */
  entryCloseDay: string | null;
  /** IANA timezone for deciding whether this show's close day has passed. */
  showTimezone: string;
  /** True when this balance belongs to a show whose final day has passed. */
  isPastShow?: boolean;
  amountDueCents: number;
  onlineDueCents: number;
  payAtShowDueCents: number;
  entryIds: string[];
  paymentHref: string;
}

export interface EntryBalanceSummary {
  currentFeesCents: number;
  amountDueCents: number;
  onlineDueCents: number;
  payAtShowDueCents: number;
  onlineShowBalances: EntryBalanceShowSummary[];
}

/**
 * Raw per-class-per-dog row shape returned by `getUserEntries` — the single
 * query both My Shows and My Payments load from. Kept intentionally loose
 * (`Record<string, unknown>` base) since callers only need the fields below;
 * both surfaces cast their query rows to this shape.
 */
export type EntryBalanceRawRow = Record<string, unknown> & {
  id: string;
  show_id?: string | null;
  entry_status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  entry_fee?: number | null;
  show?: {
    id?: string | null;
    name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    entry_close_date?: string | null;
    trials?: EntryWindowTrial[] | null;
  } | null;
  registration?: {
    payment_status?: string | null;
  } | null;
  trial?: { timezone?: string | null } | null;
  class?: { trial?: { timezone?: string | null } | null } | null;
};

/**
 * Canonical raw-row → `EntryBalanceSource` mapping (exhibitor-money-clarity).
 * My Shows and My Payments must both derive their amount-due figure from this
 * SAME mapping over the SAME ungrouped per-class rows, or they can disagree
 * whenever a registration-less (secretary/mail-in) order has per-class rows
 * with different `payment_status` values — see
 * `__tests__/crossSurfaceAmountDue.test.ts`. Grouping rows into one order/dog
 * card for *display* (see `groupEntriesByOrder`) is fine, but money math must
 * run on the raw rows, not a lossy "first row wins" grouped summary.
 */
/**
 * The timezone the show's calendar days are reckoned in, matching the
 * entry-close guard.
 *
 * The guard resolves the show's PRIMARY trial — earliest `date`, ties broken by
 * id — and uses its timezone; `getEntryWindowTimezone` is the canonical client
 * implementation of that ordering, so a show with trials in different zones
 * (a supported configuration) picks the same one the server does rather than
 * whichever trial this particular entry happens to be in.
 *
 * Falls back to the entry's own trial when the show's trial list is absent —
 * a partial row from a degraded read path is better served by a nearby
 * timezone than by the bare default.
 */
function resolveShowTimezone(row: EntryBalanceRawRow): string {
  const trials = row.show?.trials;
  if (trials && trials.length > 0) return getEntryWindowTimezone(trials);
  return getTrialTimezone(row.trial ?? row.class?.trial ?? null);
}

export function mapEntryRowToBalanceSource(row: EntryBalanceRawRow): EntryBalanceSource {
  const show = row.show;
  const paymentStatus = row.registration?.payment_status ?? row.payment_status ?? 'pending';

  return {
    id: row.id,
    showId: show?.id ?? row.show_id ?? '',
    showName: show?.name ?? null,
    showDate: parseShowDate(show?.start_date) ?? new Date(),
    showEndDate: parseShowDate(show?.end_date),
    entryCloseDay: toEntryCloseDay(show?.entry_close_date),
    showTimezone: resolveShowTimezone(row),
    entryStatus: mapEntryStatus(row.entry_status ?? 'pending'),
    paymentStatus: mapPaymentStatus(paymentStatus),
    paymentMethod: row.payment_method ?? null,
    totalFee: row.entry_fee ?? 0,
  };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function showLastDay(entry: EntryBalanceSource): Date {
  return entry.showEndDate ?? entry.showDate;
}

function isPastShowEntry(entry: EntryBalanceSource, now: Date): boolean {
  return startOfLocalDay(showLastDay(entry)).getTime() < startOfLocalDay(now).getTime();
}

/**
 * Whether a row counts toward exhibitor balances at `now`.
 *
 * Exported so callers derive eligibility from the SAME rule the totals use.
 * Re-implementing it (e.g. filtering purely on `paymentStatus === PENDING`)
 * silently includes withdrawn/rejected/past rows the totals exclude, which is
 * how a card ends up offering payment while the page summary says $0 due.
 */
export function isCurrentSummaryEntry(entry: EntryBalanceSource, now: Date): boolean {
  if (isPastShowEntry(entry, now)) return false;
  return isBalanceEligibleEntry(entry);
}

/**
 * A show date limits the current-entry view, not whether an unpaid balance
 * exists. Past unpaid entries remain debt until they are paid or otherwise
 * settled; dropping them made both exhibitor money surfaces claim "paid in
 * full" after the show ended.
 */
function isBalanceEligibleEntry(entry: EntryBalanceSource): boolean {
  return (
    entry.entryStatus === EntryStatus.ACCEPTED ||
    entry.entryStatus === EntryStatus.COMPLETED ||
    entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED ||
    entry.entryStatus === EntryStatus.PENDING
  );
}

function feeCents(feeDollars: number): number {
  return Math.max(0, Math.round(feeDollars * 100));
}

function entryIdsForPayment(entry: EntryBalanceSource): string[] {
  const classEntryIds = entry.classes?.map(cls => cls.id).filter(Boolean) ?? [];
  return classEntryIds.length > 0 ? classEntryIds : [entry.id];
}

export function summarizeEntryBalances(
  entries: EntryBalanceSource[],
  now: Date = new Date()
): EntryBalanceSummary {
  const showBalances = new Map<string, Omit<EntryBalanceShowSummary, 'paymentHref'>>();
  let currentFeesCents = 0;
  let amountDueCents = 0;
  let onlineDueCents = 0;
  let payAtShowDueCents = 0;

  for (const entry of entries) {
    const isCurrentEntry = isCurrentSummaryEntry(entry, now);
    if (!isCurrentEntry && !isBalanceEligibleEntry(entry)) continue;

    const cents = feeCents(entry.totalFee);
    if (isCurrentEntry) currentFeesCents += cents;

    const prompt = getEntryPaymentPrompt({
      paymentMethod: entry.paymentMethod,
      paymentStatus: entry.paymentStatus,
      totalFee: entry.totalFee,
    });
    if (prompt.kind === 'none') continue;

    amountDueCents += cents;

    if (prompt.kind === 'pay-at-show') {
      payAtShowDueCents += cents;
      continue;
    }

    onlineDueCents += cents;
    const showId = entry.showId;
    if (!showId) continue;

    const existing = showBalances.get(showId) ?? {
      showId,
      showName: entry.showName || 'This show',
      entryCloseDay: entry.entryCloseDay ?? null,
      showTimezone: entry.showTimezone || DEFAULT_SHOW_TIMEZONE,
      isPastShow: isPastShowEntry(entry, now),
      amountDueCents: 0,
      onlineDueCents: 0,
      payAtShowDueCents: 0,
      entryIds: [],
    };
    existing.amountDueCents += cents;
    existing.onlineDueCents += cents;
    // Every row for a show shares one close day, but rows can reach here from
    // paths that resolved the show join and paths that did not. First known
    // day wins so one relation-less row cannot erase a deadline the others
    // carry.
    existing.entryCloseDay = existing.entryCloseDay ?? entry.entryCloseDay ?? null;
    existing.isPastShow = existing.isPastShow || isPastShowEntry(entry, now);
    existing.entryIds.push(...entryIdsForPayment(entry));
    showBalances.set(showId, existing);
  }

  const onlineShowBalances = [...showBalances.values()]
    .map(show => ({
      ...show,
      entryIds: [...new Set(show.entryIds)],
      paymentHref: buildFinishPaymentHref(show.showId, [...new Set(show.entryIds)]),
    }))
    .sort((a, b) => a.showName.localeCompare(b.showName));

  return {
    currentFeesCents,
    amountDueCents,
    onlineDueCents,
    payAtShowDueCents,
    onlineShowBalances,
  };
}

export function buildEntryBalanceRecoveryHref(summary: EntryBalanceSummary): string {
  if (
    summary.onlineShowBalances.length === 1 &&
    !summary.onlineShowBalances[0].isPastShow &&
    summary.onlineDueCents === summary.amountDueCents &&
    summary.payAtShowDueCents === 0
  ) {
    return summary.onlineShowBalances[0].paymentHref;
  }
  // `due=1` is a provenance marker, not a view mode: My Payments renders the
  // amount-due card first in every state, so arriving with money owed already
  // lands on it and there is nothing for the page to read. Kept because it
  // distinguishes "sent here because you owe" from a plain nav click; don't
  // add a searchParams branch on the page to "honor" it.
  if (summary.amountDueCents > 0) return '/exhibitor/payments?due=1';
  return '/exhibitor/entries';
}
