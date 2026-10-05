/**
 * Source-pinned regression for the impeccable p17 CartSummary fixes.
 *
 * The checkout button's loading state used a raw ⏳ emoji (project emoji ban,
 * renders as an OS glyph). It must use the lucide Loader2 spinner instead.
 *
 * Pinned at the source level (the surrounding component needs the cart store,
 * expiration timer, and fee hooks to render) — same pattern as other
 * source-text regression tests in this repo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, './CartSummary.tsx'), 'utf8');

describe('CartSummary source', () => {
  it('does not use the ⏳ emoji in the checkout loading state', () => {
    expect(source).not.toContain('⏳');
  });

  it('uses the Loader2 spinner for the checkout loading state', () => {
    expect(source).toContain('Loader2');
    expect(source).toMatch(/<Loader2[^>]*animate-spin/);
  });
});

/**
 * UX walk remediation 4.B — entry carts must not time-pressure the user.
 * No constant ticking countdown, and expiry must not strand the user by
 * redirecting to /shows mid-payment. MYK9-1012 removed the near-expiry
 * warning and its Extend too: the cart timer never held a spot.
 */
describe('CartSummary — de-panicked entry cart (4.B)', () => {
  it('shows no constant "Cart expires in" countdown', () => {
    expect(source).not.toContain('Cart expires in');
  });

  it('does not strand the user on expiry (no onExpired redirect)', () => {
    expect(source).not.toContain('onExpired');
  });

  it('has no cart timer: spots are held only at Pay (MYK9-1012)', () => {
    expect(source).not.toContain('useCartExpirationTimer');
    expect(source).not.toMatch(/>\s*Extend/);
  });
});
