import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression contract for the stripe-webhook entry-payment cart claim.
 *
 * The bug this pins against (found 2026-06-20 driving a live sandbox payment):
 * the claim that flips a paid cart `active → submitted` filtered on expiry with
 *
 *     .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
 *
 * A raw ISO timestamp inside PostgREST's `.or()` mini-language misparses the
 * dotted/colon'd value, so the whole UPDATE failed at runtime with
 * `column entry_carts.expires_at does not exist`. Because Stripe already has
 * its 200 (EdgeRuntime.waitUntil), the event is NOT retried — the exhibitor is
 * charged and ZERO entries are created, signalled only by an admin email.
 *
 * Expiry is already enforced upstream in pure code by `sessionMatchesCart`
 * (see sessionCartGuard.test.ts: "rejects a paid session for an EXPIRED cart"),
 * so the claim only needs the `status = 'active'` idempotency latch. These
 * assertions guard against anyone re-adding a PostgREST filter on `expires_at`
 * to the UPDATE.
 */
const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);

describe('stripe-webhook entry-payment cart claim', () => {
  it('flips the paid cart active → submitted as an idempotency latch', () => {
    expect(source).toContain(".update({ status: 'submitted' })");
    expect(source).toContain(".eq('status', 'active')");
  });

  it('never filters the claim on expires_at via a PostgREST .or() (the silent charge-without-entries bug)', () => {
    // These tokens only appear inside a PostgREST filter string, never in
    // legitimate JS property access like `cart.expires_at`.
    expect(source).not.toContain('expires_at.gt.');
    expect(source).not.toContain('expires_at.is.null');
  });
});
