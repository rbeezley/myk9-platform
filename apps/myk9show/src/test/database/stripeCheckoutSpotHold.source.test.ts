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
      'const created = await createSessionUnderHold( supabase, attempt, holdUntilEpoch, priorSessionId, expiresAtEpoch => stripe.checkout.sessions.create({'
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
      'attachCartSpotHolds(supabase, attempt, session.id, sessionExpiresAtEpoch)'
    );
  });

  // Codex P1 on #2755: every hold write is scoped to this request's attempt,
  // and a page whose holds are not all tied is expired, never handed out.
  it('scopes every hold write to a fresh attempt and hands out only a fully held page', () => {
    expect(compact).toContain(
      'const attempt = { cartId: cart_id, attemptId: crypto.randomUUID() };'
    );
    expect(compact).toContain('releaseCartSpotHolds(supabase, attempt)');
    expect(compact).not.toContain('releaseCartSpotHolds(supabase, cart_id)');
    expect(compact).toContain('if (!pageIsFullyHeld(attached, heldCount)) {');
    expect(compact).toContain("await abandonSession('holds not tied');");
  });

  it("re-takes the hold for a reused page, for that page's own expiry", () => {
    expect(compact).toContain(
      'holdCartSpots(supabase, attempt, reusedExpiresAtEpoch, { sessionId: reused.id, retiredSessionId: reused.id, })'
    );
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
