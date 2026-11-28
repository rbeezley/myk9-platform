// MYK9-2497: the webhook backstop for a second subscription. After a
// subscription checkout completes and is synced, look at the customer's live
// subscriptions: every one newer than the oldest is a duplicate, and each is
// queued for a refund of its first invoice (queueDuplicateSubscriptionRefund).
// Nothing here cancels or refunds: a person approves the refund and cancels
// the duplicate. Deno-free (structural Stripe types) so vitest drives it.
//
// Both completion events (the kept subscription's session and the
// duplicate's) can arrive after both subscriptions exist. Each finds the same
// duplicate, and the request is keyed on that subscription and carries ITS
// checkout session id, whichever event wrote it.

import {
  queueDuplicateSubscriptionRefund,
  type DuplicateSubscriptionOutcome,
} from '../_shared/duplicateSubscriptionRefund.ts';
import {
  splitLiveSubscriptions,
  type RankedSubscription,
} from '../_shared/customerSubscriptions.ts';
import type { RefundQueueDeps } from '../_shared/refundRequests.ts';

type IdOrObject = string | { id: string } | null | undefined;

const idOf = (value: IdOrObject): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

/** The fields of the completed checkout session this reads. */
export interface CompletedSubscriptionSession {
  id: string;
  subscription?: IdOrObject;
  invoice?: IdOrObject;
}

export interface DuplicateLookupStripe {
  checkout: {
    sessions: {
      list(params: {
        subscription: string;
        limit: number;
      }): Promise<{ data: Array<{ id: string; invoice?: IdOrObject }> }>;
    };
  };
  invoices: {
    retrieve(id: string): Promise<{ payment_intent?: IdOrObject; amount_paid: number }>;
  };
}

export interface DuplicateSubscriptionDeps {
  stripe: DuplicateLookupStripe;
  queue: RefundQueueDeps;
}

/** The duplicate's checkout session and first invoice. */
async function duplicateOrigin(
  stripe: DuplicateLookupStripe,
  duplicateId: string,
  session: CompletedSubscriptionSession
): Promise<{ sessionId: string | null; invoiceId: string | null }> {
  if (idOf(session.subscription) === duplicateId) {
    return { sessionId: session.id, invoiceId: idOf(session.invoice) };
  }
  const { data } = await stripe.checkout.sessions.list({ subscription: duplicateId, limit: 1 });
  const origin = data[0];
  return { sessionId: origin?.id ?? null, invoiceId: idOf(origin?.invoice) };
}

/**
 * Queue each duplicate among `subscriptions` (the customer's, as the sync
 * just read them). Returns one outcome per duplicate; empty when the
 * customer holds at most one live subscription. Throws when Stripe or the
 * queue cannot be reached, so Stripe redelivers the event.
 */
export async function queueDuplicateSubscriptions(
  deps: DuplicateSubscriptionDeps,
  customerId: string,
  session: CompletedSubscriptionSession,
  subscriptions: RankedSubscription[]
): Promise<DuplicateSubscriptionOutcome[]> {
  const { kept, duplicates } = splitLiveSubscriptions(subscriptions);
  if (!kept) return [];
  const outcomes: DuplicateSubscriptionOutcome[] = [];
  for (const duplicate of duplicates) {
    const { sessionId, invoiceId } = await duplicateOrigin(deps.stripe, duplicate.id, session);
    const invoice = invoiceId ? await deps.stripe.invoices.retrieve(invoiceId) : null;
    outcomes.push(
      await queueDuplicateSubscriptionRefund(deps.queue, {
        duplicateSubscriptionId: duplicate.id,
        keptSubscriptionId: kept.id,
        customerId,
        sessionId,
        paymentIntentId: idOf(invoice?.payment_intent),
        amountCents: invoice ? invoice.amount_paid : null,
      })
    );
  }
  return outcomes;
}
