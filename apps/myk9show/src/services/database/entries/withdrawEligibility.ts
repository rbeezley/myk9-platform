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
import { resolveEffectivePaymentStatus } from '@/utils/effectivePaymentStatus';
import { PaymentStatus } from '@/types/show-registration-types';
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
  // withdraw. `entries_entry_status_check` admits BOTH spellings of each
  // request status and the live column holds the hyphenated form, so all four
  // are listed rather than the one this codebase happens to write.
  'scratch-requested',
  'scratch_requested',
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
  | 'removed'
  | 'paid'
  | 'unknown-payment'
  | 'status'
  | 'scored'
  | 'at-show'
  | 'unavailable'
  | 'missing'
  | 'conflict';

export interface WithdrawEligibilityInput {
  /**
   * MYK9-632: which act is being offered. The two share every guard EXCEPT the
   * money arm — a WITHDRAWAL of a paid entry is refused (its rulebook refund
   * entitlement is the secretary's to assert), while a PULL of a paid entry is
   * allowed, because the club decides that refund afterwards and the
   * reconciliation surface only ever sees the row once it is pulled. Defaults to
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

/**
 * The money arm, FAIL-CLOSED. The RPC refuses unless `payment_status` is
 * literally 'pending' or 'waived' (`IS DISTINCT FROM` both), so an unknown or
 * missing status must refuse here too — otherwise the client offers a
 * withdrawal the server rejects, which is the whole class of bug this predicate
 * exists to prevent. Returns null when the status could not be determined.
 */
function moneyAllowsWithdrawal(input: WithdrawEligibilityInput): boolean | null {
  const effective = resolveEffectivePaymentStatus(
    (input.paymentStatus ?? null) as PaymentStatus | null,
    (input.enrollmentPaymentStatus ?? null) as PaymentStatus | null
  );
  if (effective == null) return null;
  return effective === PaymentStatus.PENDING || effective === PaymentStatus.WAIVED;
}

export function evaluateWithdrawEligibility(input: WithdrawEligibilityInput): WithdrawEligibility {
  const kind: RemoveFromClassKind = input.kind ?? 'withdraw';

  if (input.deletedAt != null) {
    return refuse('removed', 'This entry has been removed.');
  }

  // The money arm is the WITHDRAWAL's alone (MYK9-632). A pull reads no payment
  // state at all, here or in the RPC, so there is nothing to fail closed on.
  if (kind === 'withdraw') {
    const moneyAllows = moneyAllowsWithdrawal(input);
    if (moneyAllows === null) {
      return refuse(
        'unknown-payment',
        "We couldn't confirm this entry's payment status — ask the secretary to pull it."
      );
    }
    if (!moneyAllows) {
      return refuse('paid', 'This entry is paid — request a refund instead of withdrawing.');
    }
  }

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

export class WithdrawUnavailableError extends Error {
  readonly code: WithdrawRefusalCode = 'unavailable';

  constructor() {
    super("We couldn't reach the server — try withdrawing again when you're connected.");
    this.name = 'WithdrawUnavailableError';
  }
}

export class WithdrawNotAllowedError extends Error {
  readonly code: WithdrawRefusalCode;

  constructor(eligibility: WithdrawEligibility) {
    super(eligibility.reason ?? 'This entry cannot be withdrawn.');
    this.name = 'WithdrawNotAllowedError';
    this.code = eligibility.code ?? 'status';
  }
}

/**
 * Turn any withdrawal failure into a sentence an exhibitor can act on.
 *
 * Server refusals arrive as raw Postgres text carrying the row UUID
 * ("Entry 22eb47a9-… is paid; request a refund instead of withdrawing"). That is
 * exactly right for the logger and wrong for a person, so the UI switches on the
 * CODE and reuses the sentences this module already owns.
 *
 * Two code spaces meet here: our own refusal codes (thrown by the client
 * pre-check, already carrying a written sentence) and the SQLSTATEs the
 * `withdraw_own_entry` RPC raises. The pre-check covers the common refusals, so
 * a 42501 that still arrives means the row changed under us.
 */
const SERVER_MESSAGES: Record<string, string> = {
  // The RPC's own owner-tier guards. Reaching one means the entry changed
  // between the pre-check and the call — e.g. a secretary marked it paid.
  '42501': 'This entry can no longer be withdrawn — ask the secretary to pull it.',
  // invalid_parameter_value: the payload was wrong. Not the exhibitor's doing.
  '22023': "Something went wrong preparing this withdrawal — we've logged it.",
  P0002: 'This entry no longer exists — refresh the page and try again.',
  '40001': 'Someone else changed this entry — reopen it and try again.',
};

const OWN_REFUSAL_CODES = new Set<string>([
  'removed',
  'paid',
  'unknown-payment',
  'status',
  'scored',
  'at-show',
  'unavailable',
  'missing',
  'conflict',
]);

export function withdrawErrorMessage(
  error: { code?: string | undefined; message?: string | undefined } | null | undefined
): string {
  const code = error?.code;
  // Our own errors already carry a written sentence — pass it through.
  if (code && OWN_REFUSAL_CODES.has(code) && error?.message) return error.message;
  if (code && SERVER_MESSAGES[code]) return SERVER_MESSAGES[code] as string;
  return "We couldn't withdraw this entry. Please try again.";
}

/**
 * MYK9-632: both answers for one row. The exhibitor is offered two acts, and
 * only the money arm differs between them, so a single verdict cannot drive the
 * dialog — a paid entry must show Withdraw greyed out with its reason WHILE Pull
 * stays live.
 */
export interface RemoveFromClassEligibility {
  withdraw: WithdrawEligibility;
  pull: WithdrawEligibility;
}
