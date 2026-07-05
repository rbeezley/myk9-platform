import { PaymentStatus } from '@/types/show-registration-types';
import { formatFee } from '@/utils/format';

/**
 * What (if anything) to prompt an exhibitor about an unpaid entry
 * (UX walk remediation 4.C — "cash/check is a status, not a debt").
 *
 * The old card showed a red "Finish Payment" CTA for ANY pending fee, which is
 * wrong — and stressful — for a cash/check exhibitor who already chose to pay at
 * the show. Now:
 *  - online (card) with a real balance → the "Finish Payment" action;
 *  - cash / check → a calm per-method STATUS line, no debt framing;
 *  - staff-recorded / waived / paid / no balance → nothing.
 *
 * The `method` argument is the RAW `entries.payment_method` value, whose
 * vocabulary is DB-native — `'online'` (set by the Stripe webhook), `'cash'`,
 * `'check'`, `'waived'`, `'secretary_paid'`, `'group_payment'` — NOT the wizard's
 * `PaymentMethod` enum (which uses `'credit_card'`). A pending card entry can
 * legitimately have a null method before the webhook resolves, so `null` /
 * unknown defaults to the online CTA rather than hiding a genuine balance.
 */
export type EntryPaymentPrompt =
  | { kind: 'finish-online' }
  | { kind: 'pay-at-show'; text: string }
  | { kind: 'none' };

export interface EntryPaymentPromptInput {
  /** Raw `entries.payment_method` (DB vocabulary), or null/undefined if unset. */
  paymentMethod: string | null | undefined;
  paymentStatus: PaymentStatus;
  /** Fee owed, in dollars. */
  totalFee: number;
}

export function getEntryPaymentPrompt({
  paymentMethod,
  paymentStatus,
  totalFee,
}: EntryPaymentPromptInput): EntryPaymentPrompt {
  // Only pending entries with a real balance prompt anything at all.
  if (paymentStatus !== PaymentStatus.PENDING || totalFee <= 0) return { kind: 'none' };

  const amount = formatFee(totalFee);
  switch (paymentMethod) {
    case 'cash':
      return { kind: 'pay-at-show', text: `Bring ${amount} cash to check-in` };
    case 'check':
      return { kind: 'pay-at-show', text: `Mail your ${amount} check to the club` };
    // Staff-recorded / group / waived: the money side isn't the exhibitor's to
    // action here, so show no CTA. (These rarely reach "pending + balance", but
    // guard anyway.)
    case 'waived':
    case 'secretary_paid':
    case 'group_payment':
      return { kind: 'none' };
    case 'online':
    default:
      // Online — or null/unknown (e.g. a card entry still pending its webhook),
      // where we default to the online CTA so a genuine balance is never hidden.
      return { kind: 'finish-online' };
  }
}
