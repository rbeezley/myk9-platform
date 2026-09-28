import { MAKE_WHOLE_METADATA_KEY } from './orderSnapshot.ts';

interface RefundInput {
  sessionId: string;
  paymentIntentId: string | null;
  reason: string;
}
interface RefundDeps {
  create: (
    params: { payment_intent: string; metadata: Record<string, string> },
    options: { idempotencyKey: string }
  ) => Promise<{ id: string }>;
  alert: (
    subject: string,
    html: string,
    options: {
      source: string;
      dedupeKey: string;
    }
  ) => Promise<void>;
}

/** A pre-claim paid mismatch has no entries or order; refund exactly once. */
export async function refundUnfulfillableCheckout(
  { sessionId, paymentIntentId, reason }: RefundInput,
  { create, alert }: RefundDeps
): Promise<void> {
  if (!paymentIntentId) throw new Error(`Paid checkout ${sessionId} has no payment intent`);
  const refund = await create(
    {
      payment_intent: paymentIntentId,
      metadata: {
        type: 'entry_checkout_auto_refund',
        checkout_session_id: sessionId,
        [MAKE_WHOLE_METADATA_KEY]: 'true',
      },
    },
    { idempotencyKey: `entry-checkout-auto-refund-${sessionId}` }
  );
  await alert(
    'Paid entry checkout auto-refunded',
    `<p>Session <code>${sessionId}</code> could not be fulfilled (${reason}). Refund <code>${refund.id}</code> was issued for payment intent <code>${paymentIntentId}</code>.</p>`,
    { source: 'stripe-webhook', dedupeKey: `entry-checkout-auto-refunded-${sessionId}` }
  );
}
