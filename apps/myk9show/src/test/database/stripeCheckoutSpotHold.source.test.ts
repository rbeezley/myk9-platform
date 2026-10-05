/**
 * MYK9-1012: stripe-checkout holds the spots BEFORE the Stripe page opens and
 * the page lives exactly as long as the hold. The orchestration is unit-tested
 * in `_shared/cartSpotHold.test.ts`; `stripe-checkout/index.ts` is a
 * `Deno.serve` module vitest cannot run, so its wiring is pinned here. Each pin
 * names a line whose removal would let a page outlive its hold, open without
 * one, or read the payer's own hold as a full class.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-checkout/index.ts'),
  'utf8'
);
const compact = source.replace(/\s+/g, ' ');

describe('stripe-checkout holds spots for the life of the Stripe page', () => {
  it('runs one checkout per cart: claims the lease first and always ends it', () => {
    const claimAt = compact.indexOf('const claim = await claimCartCheckout(supabase, lease);');
    expect(claimAt).toBeGreaterThan(-1);
    expect(compact.indexOf('checkoutUnderLease(')).toBeGreaterThan(claimAt);
    expect(compact).toContain(
      "if (claim.kind === 'in_progress') { return corsResponse( corsHeaders, { error: CHECKOUT_IN_PROGRESS_MESSAGE, code: CHECKOUT_IN_PROGRESS_CODE }, 409 ); }"
    );
    expect(compact).toContain('} finally { const ended = await endCartCheckout(supabase, lease);');
    // The cart is read again under the lease, never only before it.
    expect(
      compact.indexOf('const { data: cart, error: cartError } = await loadCheckoutCart(cart_id);')
    ).toBeGreaterThan(claimAt);
  });

  it('opens a new page only through createSessionUnderHold, with the hold expiry', () => {
    expect(compact).toContain(
      'const created = await createSessionUnderHold( supabase, lease, holdUntilEpoch, expiresAtEpoch => stripe.checkout.sessions.create({'
    );
    // The page's expiry is the hold's, not a second clock.
    expect(compact).toContain('expires_at: expiresAtEpoch,');
    expect(source).not.toContain('31 * 60');
  });

  it('links the page and ties its holds in one call, handing it out only when linked', () => {
    expect(compact).toContain(
      'const sessionExpiresAtEpoch = session.expires_at ?? holdUntilEpoch;'
    );
    expect(compact).toContain(
      'const link = await linkCartCheckout(supabase, lease, { sessionId: session.id, sessionExpiresAtEpoch, expectedUpdatedAt: cart.updated_at, heldCount,'
    );
    for (const refusal of ['cart_changed', 'holds_lost', 'error']) {
      expect(compact).toContain(`if (link.kind === '${refusal}') {`);
    }
    // No second path writes the session link.
    expect(source).not.toMatch(/stripe_checkout_session_id: session\.id/);
  });

  it("re-takes the hold for a reused page, for that page's own expiry", () => {
    expect(compact).toContain('holdCartSpots(supabase, lease, reusedExpiresAtEpoch, reused.id)');
  });

  it('answers a refused line with 409 before any page exists', () => {
    expect(compact).toContain('if (error instanceof CartHoldRefusedError) {');
    expect(compact).toContain(
      "{ error: describeRefusedLines(error.lines, cart.items), code: 'spots_unavailable' }, 409"
    );
  });

  it("leaves the payer's own holds out of the class gate", () => {
    expect(compact).toContain(
      "supabase.rpc( 'class_entry_availability', classGateRpcArgs(classIds, authUserId) )"
    );
  });
});
