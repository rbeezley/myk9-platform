import { parseLocalDateString } from '@/utils/dateLocal';
import { startOfLocalDay } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import type { EntryStatus } from '@/types/entry-lifecycle';
import {
  getEntryStatusKind,
  getRefundLabel,
  getRemovedStatusLabel,
  isRemovedStatus,
} from '@/services/entryDisplay/entryDisplaySelectors';
import { getReviewStateLabel } from '@/components/entries/management/reviewStateLabels';

interface PendingResultEntry {
  hasResult: boolean;
  result?: unknown;
  trialDate: string;
}

/**
 * The runtime domain of `payment_status` is wider than the entry store's
 * declared `'pending' | 'paid' | 'refunded'` union: the replication mapper
 * casts the raw column without validating it (see entry-store-helpers.ts), so
 * values like `'partial_refund'` (refund seam) and `'waived'` (move-ups) reach
 * this layer. Model the real domain here so a partial refund is not silently
 * dropped from the exhibitor's terminal-state label.
 */
export type EntryPaymentStatus = 'pending' | 'paid' | 'refunded' | 'partial_refund' | 'waived';

interface RemovedStateEntry {
  entryStatus: EntryStatus;
  paymentStatus: EntryPaymentStatus;
}

function parseTrialDate(value: string): Date | undefined {
  const localDate = parseLocalDateString(value);
  if (localDate) return localDate;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function isPastTrialDate(trialDate: string, now = new Date()): boolean {
  const parsed = parseTrialDate(trialDate);
  if (!parsed) return false;

  return startOfLocalDay(parsed).getTime() < startOfLocalDay(now).getTime();
}

export function getPendingResultLabel(entry: PendingResultEntry, now = new Date()): string | null {
  if (entry.hasResult && entry.result) return null;
  // Result rows are class-specific, so use trialDate here instead of whole-show end dates.
  return isPastTrialDate(entry.trialDate, now) ? 'Awaiting results' : 'Upcoming';
}

/**
 * Label for an entry in a terminal removal state (withdrawn/scratched/etc.),
 * suffixed with the refund state when the exhibitor was paid back. Returns
 * `null` for live entries so the caller falls through to the pending/result
 * label. This is the same terminal state the secretary's Entry Management view
 * renders — reading it here keeps the two roles in agreement (UX-P1-04).
 */
export function getRemovedStateLabel(entry: RemovedStateEntry): string | null {
  // Removal classification + refund are now owned by the shared entry-display
  // selector, so this tab can't disagree with the page / secretary view on
  // whether an entry is terminal (the old private 3-literal allowlist missed
  // legacy values like 'cancelled' and mislabeled them "Upcoming").
  const kind = getEntryStatusKind(entry.entryStatus);
  if (!isRemovedStatus(kind)) return null;
  const base =
    kind === 'not_accepted'
      ? `${getReviewStateLabel('not_accepted', 'exhibitor')} · Contact show secretary`
      : (getRemovedStatusLabel(kind) ?? '');
  const refund = getRefundLabel({ paymentStatus: entry.paymentStatus });
  return refund ? `${base} · ${refund}` : base;
}
