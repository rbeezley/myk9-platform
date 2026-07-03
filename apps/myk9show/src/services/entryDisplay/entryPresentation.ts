/**
 * deriveEntryPresentation — ONE composed status line + at most ONE action hint
 * per entry row (UX walk remediation 2.B(2); replaces up-to-4-chip stacking).
 *
 * Context-aware: the same entry speaks in the viewer's voice — a paid-but-
 * unreviewed entry reads "Needs review" to the secretary (payment is not
 * acceptance; the standing "paid stays pending" decision) and "Submitted —
 * you're in" to the exhibitor. "Pending" (awaiting review) and "not yet run"
 * always get different words.
 *
 * Lives in services/entryDisplay/ because it consults raw `entry_status`
 * values for the owner-approved special cases — the classifier-guard test
 * enforces that no other directory may do that. Pure, React-free, safe on
 * partial/cold-store rows (unknown → "Status unavailable", never a raw enum).
 */
import {
  getEntryStatusKind,
  getRefundLabel,
  type EntryDisplayInput,
  type EntryStatusKind,
} from './entryDisplaySelectors';

export interface EntryViewer {
  viewer: 'secretary' | 'exhibitor';
}

export interface EntryPresentation {
  kind: EntryStatusKind;
  /** The one composed line, e.g. "Withdrawn · Refunded $30". */
  statusLine: string;
  /** At most one hint, e.g. "Refunded — confirm withdrawal or keep entry". */
  actionHint: string | null;
}

interface Wording {
  line: string;
  hint?: string;
}

interface VoicedWording {
  secretary: Wording;
  exhibitor: Wording;
}

/**
 * Raw-status wording that must differ from its kind's default. `paid` and
 * `promotion-expired` are the two owner-approved review-lane overrides
 * (2026-06-18); the rest disambiguate sub-states the kind folds together
 * (a scratch request is "pending" as a kind, but the secretary must see the
 * request). A Map, not a Record: raw strings come from the DB, and a plain
 * object would resolve keys like "constructor" from the prototype.
 */
const RAW_WORDING = new Map<string, VoicedWording>([
  [
    'paid',
    {
      secretary: { line: 'Needs review' },
      exhibitor: { line: "Submitted — you're in" },
    },
  ],
  [
    'promotion-expired',
    {
      secretary: {
        line: 'Needs review',
        hint: 'Waitlist promotion expired — confirm or release the spot',
      },
      exhibitor: {
        line: 'Payment window expired',
        hint: 'Contact the show secretary to re-enter',
      },
    },
  ],
  [
    'scratch-requested',
    {
      secretary: { line: 'Scratch requested', hint: 'Approve or decline the scratch' },
      exhibitor: { line: 'Scratch requested', hint: 'Awaiting secretary approval' },
    },
  ],
  [
    'scratch_requested',
    {
      secretary: { line: 'Scratch requested', hint: 'Approve or decline the scratch' },
      exhibitor: { line: 'Scratch requested', hint: 'Awaiting secretary approval' },
    },
  ],
  [
    'pending-payment',
    {
      secretary: { line: 'Awaiting payment' },
      exhibitor: { line: 'Payment needed', hint: 'Finish payment to keep your spot' },
    },
  ],
  [
    'draft',
    {
      secretary: { line: 'Draft' },
      exhibitor: { line: 'Draft', hint: 'Finish and submit this entry' },
    },
  ],
]);

const KIND_WORDING: Record<EntryStatusKind, VoicedWording> = {
  pending: {
    secretary: { line: 'Needs review' },
    exhibitor: { line: 'Submitted — awaiting review' },
  },
  accepted: {
    secretary: { line: 'Accepted' },
    exhibitor: { line: "Accepted — you're in" },
  },
  waitlist: {
    secretary: { line: 'Waitlisted' },
    exhibitor: { line: 'Waitlisted', hint: "You'll be notified if a spot opens" },
  },
  in_ring: {
    secretary: { line: 'In the ring' },
    exhibitor: { line: 'In the ring' },
  },
  completed: {
    secretary: { line: 'Scored' },
    exhibitor: { line: 'Scored' },
  },
  withdrawn: {
    secretary: { line: 'Withdrawn' },
    exhibitor: { line: 'Withdrawn' },
  },
  not_accepted: {
    secretary: { line: 'Not accepted' },
    exhibitor: { line: 'Not accepted' },
  },
  scratched: {
    secretary: { line: 'Scratched' },
    exhibitor: { line: 'Scratched' },
  },
  absent: {
    secretary: { line: 'Absent' },
    exhibitor: { line: 'Absent' },
  },
  moved: {
    secretary: { line: 'Moved' },
    exhibitor: { line: 'Moved' },
  },
  move_up_requested: {
    secretary: { line: 'Move-up requested', hint: 'Approve or decline in Move-ups & pulls' },
    exhibitor: { line: 'Move-up requested', hint: 'Awaiting secretary approval' },
  },
  unknown: {
    secretary: { line: 'Status unavailable' },
    exhibitor: { line: 'Status unavailable' },
  },
};

/**
 * The review lane for the Pending+Refunded special row: genuinely-pending
 * kinds plus the two raw review-lane overrides. Deliberately narrower than
 * the UI-enum PENDING bucket, which also swallows in_ring/absent/unknown as
 * a legacy artifact — a refunded absent entry is not "confirm withdrawal".
 */
const REVIEW_LANE_RAW = new Set(['paid', 'promotion-expired']);

export function deriveEntryPresentation(
  input: EntryDisplayInput,
  { viewer }: EntryViewer
): EntryPresentation {
  const raw = input.entryStatus ?? null;
  const kind = getEntryStatusKind(raw);
  const wording =
    (raw !== null ? RAW_WORDING.get(raw) : undefined) ??
    (KIND_WORDING[kind] ?? KIND_WORDING.unknown);
  const voice = wording[viewer];

  let statusLine = voice.line;
  let actionHint = voice.hint ?? null;

  const refundLabel = getRefundLabel({
    paymentStatus: input.paymentStatus,
    refundAmount: input.refundAmount,
    refundedAt: input.refundedAt,
  });
  if (refundLabel) {
    statusLine = `${statusLine} · ${refundLabel}`;
    const inReviewLane = kind === 'pending' || (raw !== null && REVIEW_LANE_RAW.has(raw));
    if (inReviewLane) {
      actionHint =
        viewer === 'secretary'
          ? 'Refunded — confirm withdrawal or keep entry'
          : 'Contact the show secretary about this entry';
    }
  }

  return { kind, statusLine, actionHint };
}
