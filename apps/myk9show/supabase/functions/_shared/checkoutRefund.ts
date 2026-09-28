import { MAKE_WHOLE_METADATA_KEY } from './orderSnapshot.ts';

export function findActiveAutoRefund<
  T extends {
    id: string;
    status?: string | null;
    metadata?: Record<string, string> | null;
  },
>(refunds: T[], type: string, sessionId: string, reason?: string): T | undefined {
  return refunds.find(
    refund =>
      refund.metadata?.type === type &&
      refund.metadata?.checkout_session_id === sessionId &&
      (reason === undefined || refund.metadata?.reason === reason) &&
      refund.status !== 'failed' &&
      refund.status !== 'canceled'
  );
}

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
  /** Read before creating: Stripe idempotency keys are retained for 24 hours. */
  findExisting: (paymentIntentId: string, sessionId: string) => Promise<{ id: string } | null>;
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
  { create, findExisting, alert }: RefundDeps
): Promise<void> {
  if (!paymentIntentId) throw new Error(`Paid checkout ${sessionId} has no payment intent`);
  let refund = await findExisting(paymentIntentId, sessionId);
  if (!refund) {
    try {
      refund = await create(
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
    } catch (error) {
      if ((error as { code?: string }).code !== 'charge_already_refunded') throw error;
      await alert(
        'Paid entry checkout was already refunded',
        `<p>Session <code>${sessionId}</code> could not be fulfilled (${reason}), but payment intent <code>${paymentIntentId}</code> was already refunded. Verify the refund in Stripe.</p>`,
        { source: 'stripe-webhook', dedupeKey: `entry-checkout-already-refunded-${sessionId}` }
      );
      return;
    }
  }
  await alert(
    'Paid entry checkout auto-refunded',
    `<p>Session <code>${sessionId}</code> could not be fulfilled (${reason}). Refund <code>${refund.id}</code> was issued for payment intent <code>${paymentIntentId}</code>.</p>`,
    { source: 'stripe-webhook', dedupeKey: `entry-checkout-auto-refunded-${sessionId}` }
  );
}
