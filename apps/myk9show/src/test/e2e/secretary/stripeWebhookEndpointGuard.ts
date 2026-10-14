/**
 * MYK9-971: the paid leg's fail-closed guard against a Stripe sandbox that delivers its events to a
 * shared project. Pure, with no Playwright import, so vitest can test it
 * (src/test/qa/stripeWebhookEndpointGuard.test.ts); waitlistStripe.ts fetches and calls it.
 *
 * Why: a Checkout Session the journey pays fires `checkout.session.completed` to EVERY enabled
 * endpoint of the sandbox. One pointing at a shared myK9 Supabase project makes that project's
 * webhook find no payment-link row, alert, and queue a refund request on every Nightly run.
 */

/** One page of `GET /v1/webhook_endpoints`, reduced to what the guard reads. */
export interface StripeWebhookEndpointPage {
  data: Array<{ url: string; status: string }>;
  has_more: boolean;
}

export const WEBHOOK_ENDPOINT_PAGE_LIMIT = 100;

function deliversToSharedProject(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // An endpoint URL the guard cannot read is not one it can clear.
    return true;
  }
  return host.endsWith('supabase.co') || url.toLowerCase().includes('myk9');
}

export function assertNoSharedWebhookEndpoints(endpoints: StripeWebhookEndpointPage): void {
  if (endpoints.has_more) {
    throw new Error(
      `The Stripe sandbox has more than ${WEBHOOK_ENDPOINT_PAGE_LIMIT} webhook endpoints, so the ` +
        'paid leg cannot prove none delivers to a shared Supabase project. A CI-only Stripe ' +
        'sandbox with no webhook endpoints is required.'
    );
  }
  const shared = endpoints.data.filter(
    endpoint => endpoint.status === 'enabled' && deliversToSharedProject(endpoint.url)
  );
  if (shared.length > 0) {
    throw new Error(
      `The Stripe sandbox behind STRIPE_TEST_SECRET_KEY delivers to a shared Supabase project ` +
        `(${shared.map(endpoint => endpoint.url).join(', ')}): paying here would write alerts ` +
        'and refund requests there. A CI-only Stripe sandbox with no webhook endpoints is required.'
    );
  }
}
