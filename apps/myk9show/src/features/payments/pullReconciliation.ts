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

/** The entry fields the refund-to-decide question reads, in the database's own names. */
export interface RefundToDecideInput {
  entry_status?: string | null | undefined;
  withdrawal_reason_code?: string | null | undefined;
  payment_status?: string | null | undefined;
  payment_method?: string | null | undefined;
  /** DECIMAL dollars; a string when read straight from PostgREST. */
  refund_amount?: number | string | null | undefined;
  refunded_at?: string | null | undefined;
  /** 'denied' once a person has decided; a refund is recorded on `refund_amount` instead. */
  refund_decision?: string | null | undefined;
  /** The saved decisions could not be read, so a null `refund_decision` says nothing. */
  refund_decision_unknown?: boolean | undefined;
}

/** A paid-online removal with no refund issued, whatever its saved decision. */
function paidOnlineUnrefundedRemoval(entry: RefundToDecideInput): EntryRemovalKind | null {
  if (entry.payment_status?.toLowerCase() !== 'paid') return null;
  if (entry.payment_method?.toLowerCase() !== 'online') return null;
  const refunded = Number(entry.refund_amount ?? 0);
  if ((Number.isFinite(refunded) && refunded > 0) || entry.refunded_at) return null;
  return classifyEntryRemoval({
    entryStatus: entry.entry_status,
    withdrawalReasonCode: entry.withdrawal_reason_code,
  });
}

/**
 * MYK9-2099: THE one definition of a refund to decide. Finish the show, the Show Desk pill, the
 * Pulls menu count, the Pulls list and the admin payout ledger all read it, so none can count a
 * row another does not.
 *
 * An entry that stopped running (a pull, a withdrawal, a secretary removal or a no-show), paid
 * online, with no refund issued and no decision recorded. Returns the removal's kind, or null.
 *
 * - Already denied or already refunded: decided, never "to decide".
 * - Not paid online: there is no card payment for Issue refund or Deny refund to act on, so the
 *   row could never leave the count.
 * - The removal is read from `entry_status` alone. A check-in "pulled" flag on an entry that is
 *   still entered is not a pull until the secretary makes it one.
 * - Saved decisions not read: not counted here, but by `refundDecisionUnknownRemoval`, so no
 *   screen presents a denied refund as one to decide.
 *
 * `set_entry_refund_decision` admits exactly these rows
 * (supabase/migrations/20261117152900_myk9_2099_refund_decision_removed_absent.sql). Change both
 * together. Money is never refunded here; a person decides each row.
 */
export function refundToDecideRemoval(entry: RefundToDecideInput): EntryRemovalKind | null {
  if (entry.refund_decision_unknown || entry.refund_decision) return null;
  return paidOnlineUnrefundedRemoval(entry);
}

/**
 * MYK9-2099: a removal that would be a refund to decide, except its saved decision could not be
 * read. It may already be denied, so it is neither counted nor offered a decision until it loads.
 */
export function refundDecisionUnknownRemoval(entry: RefundToDecideInput): EntryRemovalKind | null {
  return entry.refund_decision_unknown ? paidOnlineUnrefundedRemoval(entry) : null;
}

/**
 * MYK9-632 / MYK9-2099: a removal still owing a person a refund decision. The predicate form of
 * `refundToDecideRemoval`, for the payout ledger's unresolved count.
 */
export function isUnresolvedRemovalRefundDecision(entry: PullRefundDecisionEntry): boolean {
  return refundToDecideRemoval(entry) !== null;
}

/**
 * MYK9-987: the four ways an entry stops running, one predicate for every
 * surface that counts them (the Entries "Pulls" view, the closeout card, the
 * refund gates). They are never synonyms (LESSONS pull-vs-withdraw):
 *
 * - `pulled`: the exhibitor's choice ('scratched'); the club decides the
 *   refund. A check-in 'pulled' flag is not one until the desk confirms it.
 * - `withdrawn`: 'withdrawn' WITH a recognised reason code (In Season / Judge
 *   Change); the premium decides.
 * - `removed`: 'withdrawn' with NO reason code, a secretary removal.
 * - `absent`: a no-show.
 */
export type EntryRemovalKind = 'pulled' | 'withdrawn' | 'removed' | 'absent';

export interface EntryRemovalInput {
  entryStatus?: string | null | undefined;
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
  return entryStatus === 'absent' ? 'absent' : null;
}

/**
 * The two acts an exhibitor leaves behind. The Entries "Pulls" view lists every one of these, and
 * every other removal with a refund to decide (`isPullsListEntry`).
 */
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

/** One kind's label, as `describeEntryRemovals` writes it: "removed by the secretary". */
export function describeEntryRemovalKind(kind: EntryRemovalKind): string {
  return REMOVAL_LABELS[kind];
}

/** "1 pulled, 2 removed by the secretary": every non-zero kind under its true label. */
export function describeEntryRemovals(counts: EntryRemovalCounts): string {
  return (Object.keys(REMOVAL_LABELS) as EntryRemovalKind[])
    .filter(kind => counts[kind] > 0)
    .map(kind => `${counts[kind]} ${REMOVAL_LABELS[kind]}`)
    .join(', ');
}
