// @vitest-environment node
/**
 * MYK9-971: the wait-list paid leg's fail-closed guard. Lives here, not beside the module under
 * `src/test/e2e/`, because vitest excludes that tree.
 */
import { describe, expect, it } from 'vitest';
import { assertNoSharedWebhookEndpoints } from '../e2e/secretary/stripeWebhookEndpointGuard';

const SHARED = 'https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook';

describe('assertNoSharedWebhookEndpoints', () => {
  it('passes a sandbox with no endpoints', () => {
    expect(() => assertNoSharedWebhookEndpoints({ data: [], has_more: false })).not.toThrow();
  });

  it('passes a disabled endpoint on a Supabase project', () => {
    expect(() =>
      assertNoSharedWebhookEndpoints({
        data: [{ url: SHARED, status: 'disabled' }],
        has_more: false,
      })
    ).not.toThrow();
  });

  it('fails an enabled endpoint on a Supabase project, naming the fix', () => {
    expect(() =>
      assertNoSharedWebhookEndpoints({
        data: [{ url: SHARED, status: 'enabled' }],
        has_more: false,
      })
    ).toThrow(
      /delivers to a shared Supabase project.*CI-only Stripe sandbox with no webhook endpoints/s
    );
  });

  it('fails an enabled endpoint whose URL names myk9', () => {
    expect(() =>
      assertNoSharedWebhookEndpoints({
        data: [{ url: 'https://hooks.myk9show.com/stripe', status: 'enabled' }],
        has_more: false,
      })
    ).toThrow(/shared Supabase project/);
  });

  it('passes an unrelated enabled endpoint', () => {
    expect(() =>
      assertNoSharedWebhookEndpoints({
        data: [{ url: 'https://example.com/hooks/stripe', status: 'enabled' }],
        has_more: false,
      })
    ).not.toThrow();
  });

  it('fails closed when Stripe has more endpoints than one page shows', () => {
    expect(() => assertNoSharedWebhookEndpoints({ data: [], has_more: true })).toThrow(
      /more than 100 webhook endpoints/
    );
  });
});
