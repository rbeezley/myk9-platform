export type PullTiming = 'before_close' | 'after_close' | null;
export type PullRefundDecision = 'denied';
export type PullRefundChoice = 'refund' | PullRefundDecision;

const DEFAULT_TIMEZONE = 'America/New_York';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localCalendarDate(instant: Date, timeZone: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  };

  try {
    return format(timeZone);
  } catch {
    return format(DEFAULT_TIMEZONE);
  }
}

export function derivePullTiming({
  pulledAt,
  entryCloseDate,
  timeZone,
}: {
  pulledAt: string | null | undefined;
  entryCloseDate: string | null | undefined;
  timeZone: string | null | undefined;
}): PullTiming {
  if (!pulledAt || !entryCloseDate) return null;
  const closeDay = entryCloseDate.slice(0, 10);
  if (!ISO_DATE.test(closeDay)) return null;

  const pulledInstant = new Date(pulledAt);
  if (Number.isNaN(pulledInstant.getTime())) return null;

  const pulledDay = localCalendarDate(pulledInstant, timeZone || DEFAULT_TIMEZONE);
  return pulledDay <= closeDay ? 'before_close' : 'after_close';
}

export function getSuggestedPullRefundDecision(timing: PullTiming): PullRefundChoice | null {
  if (timing === 'before_close') return 'refund';
  if (timing === 'after_close') return 'denied';
  return null;
}

export interface PullRefundDecisionEntry {
  entry_status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  refund_amount: number | null;
  refund_decision: string | null;
  /** MYK9-632: set only on a WITHDRAWAL, and only to one of the two codes. */
  withdrawal_reason_code?: string | null;
}

/**
 * MYK9-632: the row states an exhibitor can leave behind that still owe the
 * secretary a refund decision.
 *
 * 'scratched' is a PULL — the club decides. 'withdrawn' WITH a recognised reason
 * code is a WITHDRAWAL — the premium decides, and the secretary confirms it on
 * the same surface. Both reach here only while paid online and unresolved.
 *
 * A 'withdrawn' row with NO reason code is deliberately excluded: every entry
 * the secretary declines or removes by hand lands in that state too
 * (`rejectEntry`, bulk status changes, pre-MYK9-632 rows), and sweeping those
 * into a refund queue would invent an obligation nobody agreed to. The reason
 * code is what makes a withdrawal the exhibitor's own act.
 */
export function isUnresolvedRemovalRefundDecision(entry: PullRefundDecisionEntry): boolean {
  const kind = classifyEntryRemoval({
    entryStatus: entry.entry_status,
    withdrawalReasonCode: entry.withdrawal_reason_code,
  });

  return (
    isExhibitorRemoval(kind) &&
    entry.payment_method === 'online' &&
    entry.payment_status === 'paid' &&
    (entry.refund_amount ?? 0) <= 0 &&
    entry.refund_decision === null
  );
}

/**
 * MYK9-987: the four ways an entry stops running, one predicate for every
 * surface that counts them (the Entries "Pulls" view, the closeout card, the
 * refund gates). They are never synonyms (LESSONS pull-vs-withdraw):
 *
 * - `pulled`: the exhibitor's choice ('scratched', or a check-in 'pulled');
 *   the club decides the refund.
 * - `withdrawn`: 'withdrawn' WITH a recognised reason code (In Season / Judge
 *   Change); the premium decides.
 * - `removed`: 'withdrawn' with NO reason code, a secretary removal.
 * - `absent`: a no-show.
 */
export type EntryRemovalKind = 'pulled' | 'withdrawn' | 'removed' | 'absent';

export interface EntryRemovalInput {
  entryStatus?: string | null | undefined;
  /** Only the closeout read carries it; the Entries view passes none. */
  checkInStatus?: string | null | undefined;
  withdrawalReasonCode?: string | null | undefined;
}

export function classifyEntryRemoval(input: EntryRemovalInput): EntryRemovalKind | null {
  const entryStatus = input.entryStatus?.toLowerCase();
  if (entryStatus === 'scratched') return 'pulled';
  if (entryStatus === 'withdrawn') {
    return input.withdrawalReasonCode === 'in_season' ||
      input.withdrawalReasonCode === 'judge_change'
      ? 'withdrawn'
      : 'removed';
  }
  if (entryStatus === 'absent') return 'absent';
  return input.checkInStatus?.toLowerCase() === 'pulled' ? 'pulled' : null;
}

/** What the Entries "Pulls" view lists: the two acts an exhibitor leaves behind. */
export function isExhibitorRemoval(kind: EntryRemovalKind | null): boolean {
  return kind === 'pulled' || kind === 'withdrawn';
}

export type EntryRemovalCounts = Record<EntryRemovalKind, number>;

export function emptyEntryRemovalCounts(): EntryRemovalCounts {
  return { pulled: 0, withdrawn: 0, removed: 0, absent: 0 };
}

const REMOVAL_LABELS: Record<EntryRemovalKind, string> = {
  pulled: 'pulled',
  withdrawn: 'withdrawn',
  removed: 'removed by the secretary',
  absent: 'absent',
};

/** "1 pulled, 2 removed by the secretary": every non-zero kind under its true label. */
export function describeEntryRemovals(counts: EntryRemovalCounts): string {
  return (Object.keys(REMOVAL_LABELS) as EntryRemovalKind[])
    .filter(kind => counts[kind] > 0)
    .map(kind => `${counts[kind]} ${REMOVAL_LABELS[kind]}`)
    .join(', ');
}
