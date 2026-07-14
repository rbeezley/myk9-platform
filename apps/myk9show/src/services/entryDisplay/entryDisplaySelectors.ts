/**
 * Single source of truth for per-entry DISPLAY facts.
 *
 * Why this exists: the same entry was rendered from three different data paths
 * (exhibitor My Entries page, Show Details "My Entries" tab, secretary Entry
 * Management) that each classified status / section / refund independently. On a
 * 2026-06-18 walk that made the surfaces DISAGREE — one showed "Withdrawn", one
 * showed "Upcoming", and a single-section class showed a phantom "Section A".
 * See docs/ia-review-entry-status-surfaces.md.
 *
 * The fix is one classifier. Every surface keeps its own wording/voice (the page
 * says "Pending Review", the secretary says "Pending" — intentional), but they
 * all derive the underlying KIND, removal classification, refund, and section
 * from here, so the same DB row can never land in two different buckets.
 *
 * CONTRACT:
 *  - Pure. No DB reads, no hooks, no React. It is a presentation transform over
 *    already-fetched replication-row fields, so it never breaks the offline path.
 *  - Display-only. It returns presentation strings + a machine-readable kind. It
 *    does NOT decide which role may see which field — callers/RLS gate that.
 *  - Robust to partial/cold-store rows: a missing class or unknown status returns
 *    a defined, safe value and NEVER falls through to a terminal/"Upcoming" label.
 */

/**
 * Faithful classification of an entry's lifecycle state, independent of any
 * surface's wording. Kept richer than the legacy UI `EntryStatus` enum so the
 * removal classification can't lose information (the enum merged
 * withdrawn+cancelled, which is fine for a badge but wrong for "is this removed?").
 */
export type EntryStatusKind =
  | 'pending' // submitted / awaiting decision / pre-show
  | 'accepted' // confirmed / paid
  | 'waitlist' // on the waitlist
  | 'in_ring' // day-of live states (checked-in / at-gate / in-ring / competing)
  | 'completed' // scored, results recorded
  | 'withdrawn' // exhibitor or secretary withdrew
  | 'not_accepted' // secretary declined
  | 'scratched' // scratched day-of
  | 'absent' // dog did not appear
  | 'moved' // source row of a move-up
  | 'move_up_requested' // exhibitor requested a move-up; in the approval queue
  | 'unknown'; // unrecognized — never treated as terminal

/**
 * THE classifier. Maps a raw `entry_status` string (canonical values from
 * entry-lifecycle.ts, plus legacy aliases that still reach the client) to a
 * kind. Every surface routes through this — that is what stops divergence.
 */
export function getEntryStatusKind(raw: string | null | undefined): EntryStatusKind {
  switch (raw) {
    case 'confirmed':
    case 'accepted':
    case 'paid':
    case 'scheduled': // run order assigned, but NOT yet in the ring (pre-ring)
      return 'accepted';
    case 'submitted':
    case 'pending':
    case 'draft':
    case 'no-status':
    case 'scratch-requested':
    case 'scratch_requested': // underscore form still permitted by the CHECK constraint
    case 'pending-payment':
      return 'pending';
    case 'waitlisted':
      return 'waitlist';
    case 'checked-in':
    case 'at-gate':
    case 'in-ring':
    case 'competing':
      return 'in_ring';
    case 'completed':
      return 'completed';
    case 'withdrawn':
    case 'cancelled': // legacy UI alias — previously fell through to "Upcoming" on the tab
      return 'withdrawn';
    case 'not_accepted':
    case 'rejected': // legacy value from migration 173
    case 'promotion-expired':
      return 'not_accepted';
    case 'scratched':
      return 'scratched';
    case 'absent':
      return 'absent';
    case 'moved':
      return 'moved';
    case 'move-up-requested':
    case 'move_up_requested': // underscore form still permitted by the CHECK constraint
      return 'move_up_requested';
    default:
      return 'unknown';
  }
}

/**
 * Terminal "removal" kinds: the entry will never produce a normal run result, so
 * its removal label must WIN over any pending/result/"Upcoming" label. `moved`
 * and `absent` are deliberately excluded (a move-up source stays visible beside
 * its destination; `absent` is a day-of outcome rendered through normal results).
 */
const REMOVED_KINDS: ReadonlySet<EntryStatusKind> = new Set([
  'withdrawn',
  'not_accepted',
  'scratched',
]);

export function isRemovedStatus(kind: EntryStatusKind): boolean {
  return REMOVED_KINDS.has(kind);
}

const NON_RUNNABLE_SCHEDULE_KINDS: ReadonlySet<EntryStatusKind> = new Set([
  'withdrawn',
  'not_accepted',
  'scratched',
  'moved',
]);

export function isRunnableScheduleStatus(raw: string | null | undefined): boolean {
  return !NON_RUNNABLE_SCHEDULE_KINDS.has(getEntryStatusKind(raw));
}

const ACTIVE_SUBMITTED_KINDS: ReadonlySet<EntryStatusKind> = new Set([
  'pending',
  'accepted',
  'waitlist',
  'in_ring',
  'move_up_requested',
]);

/** Present-tense submitted state used by Browse Shows and Show Detail. */
export function isActiveSubmittedEntryStatus(
  entryStatus: string | null | undefined,
  checkInStatus?: string | null | undefined
): boolean {
  return checkInStatus !== 'pulled' && ACTIVE_SUBMITTED_KINDS.has(getEntryStatusKind(entryStatus));
}

/** Removal label for a removed kind; `null` for live entries (caller falls through). */
export function getRemovedStatusLabel(kind: EntryStatusKind): string | null {
  switch (kind) {
    case 'withdrawn':
      return 'Withdrawn';
    case 'scratched':
      return 'Scratched';
    case 'not_accepted':
      return 'Not accepted';
    default:
      return null;
  }
}

export interface RefundInput {
  paymentStatus?: string | null | undefined;
  /** Ground-truth refunded amount (secretary path). Preferred over inference. */
  refundAmount?: number | null | undefined;
  refundedAt?: string | null | undefined;
}

function formatRefundAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Single refund-label resolver. Prefers the EXPLICIT refund columns
 * (`refund_amount`/`refunded_at`, the secretary's ground truth) and only falls
 * back to inferring from `payment_status` when those are absent (the exhibitor
 * replication path). Returns an atom ("Refunded" / "Partial refund" /
 * "Refunded $30"); callers compose their own separator.
 */
export function getRefundLabel({ paymentStatus, refundAmount, refundedAt }: RefundInput): string | null {
  const isPartial = paymentStatus === 'partial_refund';
  const hasExplicitRefund = (refundAmount != null && refundAmount > 0) || refundedAt != null;

  if (hasExplicitRefund) {
    const amountSuffix =
      refundAmount != null && refundAmount > 0 ? ` $${formatRefundAmount(refundAmount)}` : '';
    return `${isPartial ? 'Partial refund' : 'Refunded'}${amountSuffix}`;
  }
  if (paymentStatus === 'refunded') return 'Refunded';
  if (isPartial) return 'Partial refund';
  return null;
}

/**
 * Class section, normalized. Only AKC Scent Work Novice splits into A/B; all
 * other levels store NULL and must render as '' — defaulting NULL to 'A' printed
 * a phantom "Exterior Excellent A". This is the single home for that default.
 *
 * Three spellings all mean "no section" and collapse to '': NULL/undefined, a
 * blank/whitespace string, and the at-show/ringside sentinel '-' (previously
 * special-cased only inside atShowDataAdapter.buildClassName). Centralizing the
 * '-' rule here lets composeClassTitle stand in for that bespoke builder without
 * printing a phantom "Exterior Excellent -".
 */
export function resolveClassSection(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === '-') return '';
  return trimmed;
}

export interface ClassTitleInput {
  name?: string | null;
  element?: string | null;
  level?: string | null;
  section?: string | null;
}

/**
 * Compose a class title from its parts ("Exterior Excellent", "Interior Novice
 * A"), falling back to the stored `name`. Section is normalized through
 * resolveClassSection so a single-section class never grows a phantom letter.
 */
export function composeClassTitle({ name, element, level, section }: ClassTitleInput): string {
  const resolvedSection = resolveClassSection(section);
  const composed = [element, level, resolvedSection].map(part => part?.trim()).filter(Boolean).join(' ');
  return composed || name?.trim() || '';
}

/** Default, voice-neutral status label. Surfaces may override wording. */
export function getStatusLabel(kind: EntryStatusKind): string {
  switch (kind) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'waitlist':
      return 'Waitlist';
    case 'in_ring':
      return 'In ring';
    case 'completed':
      return 'Scored';
    case 'withdrawn':
      return 'Withdrawn';
    case 'not_accepted':
      return 'Not accepted';
    case 'scratched':
      return 'Scratched';
    case 'absent':
      return 'Absent';
    case 'moved':
      return 'Moved';
    case 'move_up_requested':
      return 'Move-Up Requested';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

export interface EntryDisplayInput {
  entryStatus?: string | null;
  paymentStatus?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  class?: ClassTitleInput | null;
}

export interface EntryDisplay {
  statusKind: EntryStatusKind;
  statusLabel: string;
  isRemoved: boolean;
  /** Removal label (e.g. "Withdrawn") when removed, else null. */
  removedLabel: string | null;
  /** Refund atom (e.g. "Refunded $30") or null. */
  refundLabel: string | null;
  section: string;
  classTitle: string;
}

/**
 * Bundle every display fact for one entry row. A class-less / cold-store row
 * yields a safe, defined result — never a terminal or "Upcoming" mislabel.
 */
export function getEntryDisplay(input: EntryDisplayInput): EntryDisplay {
  const statusKind = getEntryStatusKind(input.entryStatus);
  return {
    statusKind,
    statusLabel: getStatusLabel(statusKind),
    isRemoved: isRemovedStatus(statusKind),
    removedLabel: getRemovedStatusLabel(statusKind),
    refundLabel: getRefundLabel({
      paymentStatus: input.paymentStatus,
      refundAmount: input.refundAmount,
      refundedAt: input.refundedAt,
    }),
    section: resolveClassSection(input.class?.section),
    classTitle: input.class ? composeClassTitle(input.class) : '',
  };
}
