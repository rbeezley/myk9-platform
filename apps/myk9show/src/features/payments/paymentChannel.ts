import { PaymentStatus } from '@/types/show-registration-types';

/**
 * HOW a payment arrived, as opposed to WHETHER it did.
 *
 * `PaymentStatus` conflates the two — `PAID_ONLINE`, `PAID_BY_CHECK` and
 * `PAID_BY_CASH` are one enum with `PENDING` and `REFUNDED` — while the database
 * keeps them apart: `payment_status` is a lifecycle value (`paid`, `pending`,
 * `refunded`, `waived`) and `payment_method` is the channel. Mapping the generic
 * `'paid'` onto `PAID_ONLINE` is what F18 was: it invents a channel nobody recorded.
 *
 * That guess had been restated in three places (`mapPaymentStatus`,
 * `migratePaymentStatus`, and the Financial Report's fallback), so it lives here once.
 *
 * `unknown` is the important member. On staging, 1,228 entries are `paid` and 1,232
 * carry no `payment_method` at all — so "Paid online" was not merely wrong for the
 * mail-in cheques the audit found, it was an unfounded claim about nearly every row.
 * A secretary reconciling cheques against a Stripe payout needs "we don't know" to be
 * visibly different from "online", which is the whole point of the finding.
 */
export type PaymentChannel =
  'online' | 'check' | 'cash' | 'secretary' | 'group' | 'waived' | 'unknown';

export interface PaymentChannelInput {
  /** `entries.payment_method` — the only field that actually records a channel. */
  paymentMethod?: string | null | undefined;
  /** `entries.payment_status`, or the mapped `PaymentStatus`. */
  paymentStatus?: PaymentStatus | string | null | undefined;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Resolve the channel, preferring the recorded method over anything inferred.
 *
 * Status is consulted only for the three enum members that ARE a channel, and only
 * when no method was recorded. A bare `'paid'` resolves to `unknown`, never `online`.
 */
export function resolvePaymentChannel(input: PaymentChannelInput): PaymentChannel {
  switch (normalize(input.paymentMethod)) {
    case 'credit_card':
    case 'card':
    case 'online':
    case 'stripe':
      return 'online';
    case 'check':
    case 'cheque':
      return 'check';
    case 'cash':
      return 'cash';
    case 'secretary_paid':
      return 'secretary';
    case 'group_payment':
      return 'group';
    case 'waived':
      return 'waived';
    default:
      break;
  }

  switch (normalize(input.paymentStatus)) {
    case PaymentStatus.PAID_ONLINE:
      return 'online';
    case PaymentStatus.PAID_BY_CHECK:
      return 'check';
    case PaymentStatus.PAID_BY_CASH:
      return 'cash';
    case PaymentStatus.WAIVED:
    case 'waived':
      return 'waived';
    default:
      // Includes the generic 'paid'. See the note above: this is the case the
      // finding was about, and the honest answer is that we do not know.
      return 'unknown';
  }
}

/** Entry Management wording: a full sentence fragment for a status line. */
const ENTRY_MANAGEMENT_LABELS: Record<PaymentChannel, string> = {
  online: 'Paid online',
  check: 'Paid by check',
  cash: 'Paid by cash',
  secretary: 'Paid — recorded by secretary',
  group: 'Paid — group payment',
  waived: 'Waived',
  unknown: 'Paid',
};

/** Financial Report wording: a terse column value. */
const FINANCIAL_REPORT_LABELS: Record<PaymentChannel, string> = {
  online: 'Online',
  check: 'Check',
  cash: 'Cash',
  secretary: 'Secretary Paid',
  group: 'Group Payment',
  waived: 'Waived/Comped',
  unknown: 'Paid',
};

export function entryManagementPaymentLabel(channel: PaymentChannel): string {
  return ENTRY_MANAGEMENT_LABELS[channel];
}

export function financialReportPaymentLabel(channel: PaymentChannel): string {
  return FINANCIAL_REPORT_LABELS[channel];
}
