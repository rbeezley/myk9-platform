import { PaymentStatus } from '@/types/show-registration-types';
import type { PaymentMethod } from '@/types/show-registration-types';
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
 */
export type EntryPaymentPrompt =
  | { kind: 'finish-online' }
  | { kind: 'pay-at-show'; text: string }
  | { kind: 'none' };

export interface EntryPaymentPromptInput {
  paymentMethod: PaymentMethod | undefined;
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
    // action here, so show no CTA.
    case 'secretary_paid':
    case 'group_payment':
    case 'waived':
      return { kind: 'none' };
    case 'credit_card':
    default:
      // Online — or unknown, where we default to the online CTA so a genuine
      // balance is never hidden (cash/check are handled explicitly above).
      return { kind: 'finish-online' };
  }
}
