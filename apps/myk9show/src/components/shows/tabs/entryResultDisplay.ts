import { parseLocalDateString } from '@/utils/dateLocal';
import { startOfLocalDay } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import type { EntryStatus } from '@/types/entry-lifecycle';

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

/**
 * Terminal "removal" states where an entry will never produce a normal run
 * result. These must win over the pending/result label so the exhibitor's
 * Show Details tab agrees with the secretary's Entry Management view rather
 * than mislabeling a withdrawn entry as "Upcoming" (UX-P1-04).
 *
 * 'absent' is excluded — it's a day-of competition outcome that flows through
 * normal result rendering, not a pre-result removal. 'moved' is excluded too:
 * the move-up flow leaves the source row visible beside its live destination
 * (move-up.ts), so de-duplicating that pair is move-up-seam work, not the
 * refund/withdrawal seam this fix addresses.
 */
const REMOVED_STATE_LABELS: Partial<Record<EntryStatus, string>> = {
  withdrawn: 'Withdrawn',
  scratched: 'Scratched',
  not_accepted: 'Not accepted',
};

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
  const base = REMOVED_STATE_LABELS[entry.entryStatus];
  if (!base) return null;
  if (entry.paymentStatus === 'refunded') return `${base} · Refunded`;
  if (entry.paymentStatus === 'partial_refund') return `${base} · Partial refund`;
  return base;
}
