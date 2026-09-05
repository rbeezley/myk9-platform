/**
 * Guards the Stripe Checkout `success_url` contract.
 *
 * Stripe substitutes the session id into `success_url` only where it finds the
 * LITERAL token `{CHECKOUT_SESSION_ID}`. Building that URL with
 * `URLSearchParams` percent-encodes the braces to `%7B…%7D`, which Stripe does
 * not recognise — it returns the URL verbatim, and the confirmation page then
 * looks up a session id of literally `{CHECKOUT_SESSION_ID}`, finds nothing,
 * and tells an exhibitor whose card has already been charged that the payment
 * cannot be found (MYK9-294, reproduced 2026-09-05 with a real sandbox
 * payment). These assertions fail on the encoded form.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('../stripe-config', () => ({ products: {}, annualPriceId: 'price_annual' }));

import { createEntryCheckoutSession, STRIPE_CHECKOUT_SESSION_ID_TOKEN } from './stripe';

/** The success_url the client asked the edge function to hand Stripe. */
async function successUrlFor(options?: { splitCheckoutId?: string }): Promise<string> {
  invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/cs_test_x' }, error: null });
  await createEntryCheckoutSession('cart-1', options);
  expect(invoke).toHaveBeenCalledTimes(1);
  const body = (invoke.mock.calls[0][1] as { body: { success_url: string } }).body;
  return body.success_url;
}

// `window` is shared across every test file in a worker, so a redefined
// `location` that is never put back leaks into whatever runs next — and CI
// runs with `--sequence.shuffle`, so the victim is a different file each time.
// Capture the real descriptor and restore it.
const realLocation = Object.getOwnPropertyDescriptor(window, 'location');

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, origin: 'https://app.test', href: '' },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (realLocation) {
    Object.defineProperty(window, 'location', realLocation);
  }
});

describe('createEntryCheckoutSession success_url', () => {
  it('sends the placeholder token UNENCODED so Stripe substitutes it', async () => {
    const url = await successUrlFor();
    expect(url).toContain(`session_id=${STRIPE_CHECKOUT_SESSION_ID_TOKEN}`);
    expect(url).toContain('session_id={CHECKOUT_SESSION_ID}');
  });

  it('never percent-encodes the braces', async () => {
    const url = await successUrlFor();
    // The exact bytes that broke it: `?session_id=%7BCHECKOUT_SESSION_ID%7D`.
    expect(url).not.toContain('%7B');
    expect(url).not.toContain('%7D');
  });

  it('keeps the split token, encoded, alongside the literal placeholder', async () => {
    // A correlation id with a character that MUST stay encoded, so the fix
    // cannot be "stop encoding everything".
    const url = await successUrlFor({ splitCheckoutId: 'corr/1 2+3' });
    expect(url).toContain('session_id={CHECKOUT_SESSION_ID}');
    expect(url).toContain(`split=${encodeURIComponent('corr/1 2+3').replace(/%20/g, '+')}`);
    expect(url).not.toContain('split=corr/1 2+3');
  });

  it('omits the split param when there is no split checkout', async () => {
    const url = await successUrlFor();
    expect(url).not.toContain('split=');
  });

  it('stays parseable and on our own origin, so the server allowlist still passes', async () => {
    // The edge function rejects the request unless `new URL(success_url).origin`
    // is allowlisted (stripe-checkout/index.ts:99-105, :149). Braces in a query
    // are legal to the WHATWG parser, but assert it rather than assume it.
    const url = await successUrlFor({ splitCheckoutId: 'corr-1' });
    expect(new URL(url).origin).toBe('https://app.test');
    expect(new URL(url).pathname).toBe('/checkout/success');
  });
});
