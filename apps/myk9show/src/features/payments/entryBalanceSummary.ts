import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildFinishPaymentHref } from './finishPaymentHref';
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

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function showLastDay(entry: EntryBalanceSource): Date {
  return entry.showEndDate ?? entry.showDate;
}

function isPastShowEntry(entry: EntryBalanceSource, now: Date): boolean {
  return startOfLocalDay(showLastDay(entry)).getTime() < startOfLocalDay(now).getTime();
}

function isCurrentSummaryEntry(entry: EntryBalanceSource, now: Date): boolean {
  if (isPastShowEntry(entry, now)) return false;
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
    if (!isCurrentSummaryEntry(entry, now)) continue;

    const cents = feeCents(entry.totalFee);
    currentFeesCents += cents;

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
      amountDueCents: 0,
      onlineDueCents: 0,
      payAtShowDueCents: 0,
      entryIds: [],
    };
    existing.amountDueCents += cents;
    existing.onlineDueCents += cents;
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
  if (summary.onlineShowBalances.length === 1) {
    return summary.onlineShowBalances[0].paymentHref;
  }
  if (summary.amountDueCents > 0) return '/exhibitor/payments?due=1';
  return '/exhibitor/entries';
}
