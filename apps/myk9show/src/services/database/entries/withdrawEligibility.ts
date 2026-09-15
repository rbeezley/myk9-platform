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
];

/**
 * `check_in_status` values that still mean "not at the show". Expressed as the
 * allowed pair rather than a block-list so a value added to the DB CHECK later
 * fails CLOSED here too. Mirrors `v_pre_show_check_in` in the migration.
 */
export const PRE_SHOW_CHECK_IN_STATUSES: readonly string[] = ['no-status', 'pulled'];

export type WithdrawRefusalCode = 'removed' | 'paid' | 'status' | 'scored' | 'at-show';

export interface WithdrawEligibilityInput {
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

/** True when money has been taken (or partly returned) for this entry. */
function isSettledMoney(input: WithdrawEligibilityInput): boolean {
  const effective = resolveEffectivePaymentStatus(
    (input.paymentStatus ?? null) as PaymentStatus | null,
    (input.enrollmentPaymentStatus ?? null) as PaymentStatus | null
  );
  if (effective == null) return false;
  return effective !== PaymentStatus.PENDING && effective !== PaymentStatus.WAIVED;
}

export function evaluateWithdrawEligibility(input: WithdrawEligibilityInput): WithdrawEligibility {
  if (input.deletedAt != null) {
    return refuse('removed', 'This entry has been removed.');
  }

  if (isSettledMoney(input)) {
    return refuse('paid', 'This entry is paid — request a refund instead of withdrawing.');
  }

  const entryStatus = input.entryStatus ?? undefined;
  if (entryStatus !== undefined && !OWNER_WITHDRAWABLE_ENTRY_STATUSES.includes(entryStatus)) {
    return refuse('status', `This entry can no longer be withdrawn (status: ${entryStatus}).`);
  }

  if (input.isScored === true) {
    return refuse('scored', 'This entry has been scored and can no longer be withdrawn.');
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
export class WithdrawNotAllowedError extends Error {
  readonly code: WithdrawRefusalCode;

  constructor(eligibility: WithdrawEligibility) {
    super(eligibility.reason ?? 'This entry cannot be withdrawn.');
    this.name = 'WithdrawNotAllowedError';
    this.code = eligibility.code ?? 'status';
  }
}
