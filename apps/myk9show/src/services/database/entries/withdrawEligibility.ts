/**
 * MYK9-535: the single predicate for "may this exhibitor withdraw this entry?".
 *
 * It exists once so three places cannot drift: the Pull affordance in
 * `EntryEditDialog` (which disables the button and says why), the client
 * pre-check in `withdrawOwnEntry` (which refuses BEFORE queueing a mutation the
 * server would reject), and the owner-tier guards inside the
 * `withdraw_own_entry` SECURITY DEFINER RPC
 * (`supabase/migrations/20260915203300_withdraw_own_entry_rpc.sql`).
 *
 * The ORDER of the checks matches the RPC exactly, so the message the exhibitor
 * sees locally is the same refusal the server would have produced.
 *
 * This predicate governs the OWNER tier only. A show manager is bound by
 * `entries_update` alone and keeps the existing secretary lifecycle path.
 */
import type { RemoveFromClassKind } from '@/features/registries/withdrawalPolicy';

/**
 * `entry_status` values an owner may still withdraw FROM. Mirrors
 * `v_withdrawable_statuses` in the migration. `paid` is an entry_status in the
 * pending bucket (an entry can hold it while `payment_status` is still
 * 'pending' — the pay-by-check case), not a money fact.
 */
export const OWNER_WITHDRAWABLE_ENTRY_STATUSES: readonly string[] = [
  'no-status',
  'draft',
  'submitted',
  'paid',
  'confirmed',
  'pending-payment',
  'promotion-expired',
  // An unpaid exhibitor waiting on a secretary decision must still be able to
  // withdraw. `entries_entry_status_check` admits BOTH spellings of the move-up
  // request and the live column holds the hyphenated form, so both are listed.
  'move-up-requested',
  'move_up_requested',
];

/**
 * `check_in_status` values that still mean "not at the show". Expressed as the
 * allowed pair rather than a block-list so a value added to the DB CHECK later
 * fails CLOSED here too. Mirrors `v_pre_show_check_in` in the migration.
 */
export const PRE_SHOW_CHECK_IN_STATUSES: readonly string[] = ['no-status', 'pulled'];

export type WithdrawRefusalCode =
  'removed' | 'status' | 'scored' | 'at-show' | 'unavailable' | 'missing' | 'conflict';

export interface WithdrawEligibilityInput {
  /**
   * MYK9-632: which act is being offered. It selects the VERB in the refusal
   * sentences; the guards themselves are identical for both acts. Defaults to
   * 'withdraw', which is what every pre-MYK9-632 caller meant.
   */
  kind?: RemoveFromClassKind | undefined;
  entryStatus?: string | null | undefined;
  paymentStatus?: string | null | undefined;
  /** The order's status, so MYK9-495's entry-vs-order disagreement is resolved once. */
  enrollmentPaymentStatus?: string | null | undefined;
  checkInStatus?: string | null | undefined;
  isInRing?: boolean | null | undefined;
  isScored?: boolean | null | undefined;
  deletedAt?: string | Date | null | undefined;
}

export interface WithdrawEligibility {
  allowed: boolean;
  code?: WithdrawRefusalCode;
  /** Exhibitor-facing sentence. Present whenever `allowed` is false. */
  reason?: string;
}

const ALLOWED: WithdrawEligibility = { allowed: true };

function refuse(code: WithdrawRefusalCode, reason: string): WithdrawEligibility {
  return { allowed: false, code, reason };
}

export function evaluateWithdrawEligibility(input: WithdrawEligibilityInput): WithdrawEligibility {
  const kind: RemoveFromClassKind = input.kind ?? 'withdraw';

  if (input.deletedAt != null) {
    return refuse('removed', 'This entry has been removed.');
  }

  // NO MONEY ARM (MYK9-632, owner decision 2026-09-17). Neither act moves a
  // cent: the exhibitor records what happened and the secretary confirms the
  // refund afterwards on the reconciliation surface. The old
  // 'This entry is paid — request a refund instead of withdrawing.' refusal
  // matched a guard the RPC no longer has, and it left a paid exhibitor with no
  // honest way to say they were not coming. `paymentStatus` /
  // `enrollmentPaymentStatus` stay on the input so callers that already project
  // them keep compiling and so a future money rule has one place to land.

  const verb = kind === 'pull' ? 'pulled' : 'withdrawn';

  const entryStatus = input.entryStatus ?? undefined;
  if (entryStatus !== undefined && !OWNER_WITHDRAWABLE_ENTRY_STATUSES.includes(entryStatus)) {
    return refuse('status', `This entry can no longer be ${verb} (status: ${entryStatus}).`);
  }

  if (input.isScored === true) {
    return refuse('scored', `This entry has been scored and can no longer be ${verb}.`);
  }

  const checkInStatus = input.checkInStatus ?? undefined;
  if (
    input.isInRing === true ||
    (checkInStatus !== undefined && !PRE_SHOW_CHECK_IN_STATUSES.includes(checkInStatus))
  ) {
    return refuse(
      'at-show',
      'This entry is checked in at the show — ask the secretary to pull it.'
    );
  }

  return ALLOWED;
}

/**
 * Thrown by the client pre-check so the refusal reaches the dialog as an error
 * instead of an optimistic "withdrawn" the server never accepted.
 */
/**
 * The eligibility answer for a row that is gone. Shares its sentence with
 * `WithdrawNotFoundError` so the affordance and the failure path say the same
 * thing about the same state.
 */
export const WITHDRAW_MISSING: WithdrawEligibility = {
  allowed: false,
  code: 'missing',
  reason: 'This entry no longer exists — refresh the page and try again.',
};

/** The entry could not be found at all — deleted, or never existed. */
export class WithdrawNotFoundError extends Error {
  readonly code: WithdrawRefusalCode = 'missing';

  constructor() {
    super('This entry no longer exists — refresh the page and try again.');
    this.name = 'WithdrawNotFoundError';
  }
}

/** Someone else changed the row while this withdrawal was in flight. */
export class WithdrawConflictError extends Error {
  readonly code: WithdrawRefusalCode = 'conflict';

  constructor() {
    super('Someone else changed this entry — reopen it and try again.');
    this.name = 'WithdrawConflictError';
  }
}

/**
 * MYK9-632: the verb for the act being attempted. An exhibitor who clicked Pull
 * and is told "try withdrawing again" is being told about a different action
 * than the one they took — the same collapse this issue exists to undo, three
 * screens later on the failure path.
 */
export function removalVerb(kind: RemoveFromClassKind | undefined): 'pull' | 'withdraw' {
  return kind === 'pull' ? 'pull' : 'withdraw';
}

export class WithdrawUnavailableError extends Error {
  readonly code: WithdrawRefusalCode = 'unavailable';

  constructor(kind?: RemoveFromClassKind) {
    super(
      `We couldn't reach the server — try ${removalVerb(kind) === 'pull' ? 'pulling' : 'withdrawing'} again when you're connected.`
    );
    this.name = 'WithdrawUnavailableError';
  }
}

export class WithdrawNotAllowedError extends Error {
  readonly code: WithdrawRefusalCode;

  constructor(eligibility: WithdrawEligibility, kind?: RemoveFromClassKind) {
    super(
      eligibility.reason ??
        `This entry cannot be ${removalVerb(kind) === 'pull' ? 'pulled' : 'withdrawn'}.`
    );
    this.name = 'WithdrawNotAllowedError';
    this.code = eligibility.code ?? 'status';
  }
}

/**
 * Turn any failure into a sentence an exhibitor can act on, IN THE VERB OF THE
 * ACT THEY CHOSE. Telling someone who clicked Pull to "try withdrawing again" is
 * the same word-swap this issue exists to undo, moved onto the failure path.
 *
 * Server refusals arrive as raw Postgres text carrying the row UUID
 * ("Entry 22eb47a9-… is checked in at the show and cannot be withdrawn"). That is
 * exactly right for the logger and wrong for a person, so the UI switches on the
 * CODE and reuses the sentences this module already owns.
 *
 * Two code spaces meet here: our own refusal codes (thrown by the client
 * pre-check, already carrying a written sentence) and the SQLSTATEs the
 * `withdraw_own_entry` RPC raises. The pre-check covers the common refusals, so
 * a 42501 that still arrives means the row changed under us.
 */
/**
 * MYK9-632 round 5: the RPC's registry guard (step 1b) refuses with 22023, the
 * same SQLSTATE it uses for a malformed payload. "Something went wrong preparing
 * this withdrawal" is true of the payload case and useless here — the exhibitor
 * picked a reason their registry does not recognise, which is a fact about the
 * show, not a bug. Matched on the message because the code alone cannot tell the
 * two apart.
 */
const REGISTRY_REFUSAL =
  /does not recognise the withdrawal reason|cannot confirm the show's registry/i;

function serverMessages(kind: RemoveFromClassKind | undefined): Record<string, string> {
  const verb = removalVerb(kind);
  const past = verb === 'pull' ? 'pulled' : 'withdrawn';
  const noun = verb === 'pull' ? 'pull' : 'withdrawal';
  return {
    // The RPC's own owner-tier guards. Reaching one means the entry changed
    // between the pre-check and the call — e.g. someone checked the dog in.
    '42501': `This entry can no longer be ${past} — ask the show secretary.`,
    // invalid_parameter_value: the payload was wrong. Not the exhibitor's doing.
    '22023': `Something went wrong preparing this ${noun} — we've logged it.`,
    P0002: 'This entry no longer exists — refresh the page and try again.',
    '40001': 'Someone else changed this entry — reopen it and try again.',
    // MYK9-778: the owner tier refuses once the show has finished (closed out,
    // or its last calendar day is past in the show's zone). A settled fact, so
    // a definite sentence — never "try again" or "ask the secretary".
    MK006: `This show has finished, so this entry can no longer be ${past}.`,
  };
}

const OWN_REFUSAL_CODES = new Set<string>([
  'removed',
  'status',
  'scored',
  'at-show',
  'unavailable',
  'missing',
  'conflict',
]);

export function withdrawErrorMessage(
  error: { code?: string | undefined; message?: string | undefined } | null | undefined,
  kind?: RemoveFromClassKind
): string {
  const code = error?.code;
  // Our own errors already carry a written sentence — pass it through.
  if (code && OWN_REFUSAL_CODES.has(code) && error?.message) return error.message;
  if (error?.message && REGISTRY_REFUSAL.test(error.message)) {
    return "The show's registry doesn't recognise that reason.";
  }
  const mapped = code ? serverMessages(kind)[code] : undefined;
  if (mapped) return mapped;
  return `We couldn't ${removalVerb(kind)} this entry. Please try again.`;
}

/**
 * MYK9-632: both answers for one row. The exhibitor is offered two acts, and
 * only the money arm differs between them, so a single verdict cannot drive the
 * dialog. The two verdicts agree on every guard today (the money arm that once
 * split them is gone), but they carry DIFFERENT SENTENCES, and the chooser shows
 * each act its own — so the pair survives rather than collapsing back to one.
 */
export interface RemoveFromClassEligibility {
  withdraw: WithdrawEligibility;
  pull: WithdrawEligibility;
}
