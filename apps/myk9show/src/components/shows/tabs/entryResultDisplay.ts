import { parseLocalDateString } from '@/utils/dateLocal';
import { startOfLocalDay } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import type { EntryStatus } from '@/types/entry-lifecycle';

interface PendingResultEntry {
  hasResult: boolean;
  result?: unknown;
  trialDate: string;
}

interface RemovedStateEntry {
  entryStatus: EntryStatus;
  paymentStatus: 'pending' | 'paid' | 'refunded';
}

/**
 * Terminal "removal" states where an entry will never produce a normal run
 * result. These must win over the pending/result label so the exhibitor's
 * Show Details tab agrees with the secretary's Entry Management view rather
 * than mislabeling a withdrawn entry as "Upcoming" (UX-P1-04).
 *
 * 'absent' is intentionally excluded — it's a day-of competition outcome that
 * flows through the normal result rendering, not a pre-result removal.
 */
const REMOVED_STATE_LABELS: Partial<Record<EntryStatus, string>> = {
  withdrawn: 'Withdrawn',
  scratched: 'Scratched',
  not_accepted: 'Not accepted',
  moved: 'Moved',
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
  return entry.paymentStatus === 'refunded' ? `${base} · Refunded` : base;
}
