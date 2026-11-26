/**
 * MYK9-1824: stripe-payment-link answers with an English sentence rather than a code
 * (its catch-all is generic since MYK9-2448). Only these exact answers become a
 * specific message; anything else gets PAYMENT_LINK_FAILED. The keys are pinned to the
 * function's source by test/database/stripePaymentLinkMessages.source.test.ts. Making a
 * link charges nobody, so "no one was charged" is true on every failure.
 */
import { WITHDRAWAL_DISCLOSURE_TOO_LONG_MESSAGE } from '@/features/payments/withdrawalPolicyText';
export const PAYMENT_LINK_SERVER_MESSAGES: Record<string, string> = {
  'This show is not linked to a club payment account.':
    'This show is not connected to a club bank account yet, so no link was made. No one was charged.',
  "This club's payment account is not set up to receive online entry fees.":
    "The club's bank account is not set up to take online entry fees yet, so no link was made. No one was charged.",
  'One or more entries are already paid or not awaiting payment':
    'This entry is already paid or is not waiting for a payment, so no link was made. Close this and check the entry.',
  'One or more entries are withdrawn, scratched, or no longer active':
    'This entry was withdrawn or scratched, or is no longer active, so no link was made.',
  'A payment for one of these entries just completed — refresh to see it before requesting again.':
    'A payment for this entry just went through. Close this and check the entry before you ask for payment again.',
  // MYK9-1976: the payment page never cuts the refund policy, so a policy too long for it
  // refuses the link. The server's sentence already tells the secretary what to change.
  [WITHDRAWAL_DISCLOSURE_TOO_LONG_MESSAGE]: WITHDRAWAL_DISCLOSURE_TOO_LONG_MESSAGE,
};

/** The `error` sentence stripe-payment-link answered with, when the response carries one. */
export async function readPaymentLinkServerMessage(
  invokeError: unknown
): Promise<string | undefined> {
  const context = (invokeError as { context?: Response } | null)?.context;
  if (!context) return undefined;
  try {
    const message = (await context.json())?.error;
    return typeof message === 'string' ? message : undefined;
  } catch {
    return undefined;
  }
}

export const PAYMENT_LINK_FAILED =
  'We could not make the payment link. No one was charged. Try again.';
