// Every refund on a PaymentIntent, across all of Stripe's pages (Deno-free;
// colocated vitest). `stripe.refunds.list` returns at most 100 per call, so a
// reuse or attempt-count decision made from the first page alone can miss a
// live refund and issue a second one (MYK9-2442). stripe-approve-refund,
// stripe-refund-entry and stripe-refund-show all read refunds through this.

export interface RefundPage<T extends { id: string }> {
  data: T[];
  has_more: boolean;
}

export interface RefundPageParams {
  payment_intent: string;
  limit: number;
  starting_after?: string;
}

/** Walks `starting_after` until `has_more` is false. */
export async function listAllIntentRefunds<T extends { id: string }>(
  listPage: (params: RefundPageParams) => Promise<RefundPage<T>>,
  paymentIntentId: string,
  pageSize = 100
): Promise<T[]> {
  const all: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await listPage({
      payment_intent: paymentIntentId,
      limit: pageSize,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
    startingAfter = page.data[page.data.length - 1].id;
  }
}
