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
  it('opens a new page only through createSessionUnderHold, with the hold expiry', () => {
    expect(compact).toContain(
      'createReplacement: () => createSessionUnderHold(supabase, cart_id, holdUntilEpoch, expiresAtEpoch => stripe.checkout.sessions.create({'
    );
    // The page's expiry is the hold's, not a second clock.
    expect(compact).toContain('expires_at: expiresAtEpoch,');
    expect(compact).toContain('expires_at: epochToIso(sessionExpiresAtEpoch),');
    expect(source).not.toContain('31 * 60');
  });

  it('ties the hold to the expiry Stripe returned once the cart links the page', () => {
    expect(compact).toContain(
      'const sessionExpiresAtEpoch = session.expires_at ?? holdUntilEpoch;'
    );
    expect(compact).toContain(
      'attachCartSpotHolds(supabase, cart_id, session.id, sessionExpiresAtEpoch)'
    );
  });

  it("re-takes the hold for a reused page, for that page's own expiry", () => {
    expect(compact).toContain('holdCartSpots(supabase, cart_id, reusedExpiresAtEpoch, reused.id)');
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
