/**
 * Source-pinned regression for the impeccable p17 CartSummary fixes.
 *
 * The checkout button's loading state used a raw ⏳ emoji (project emoji ban,
 * renders as an OS glyph). It must use the lucide Loader2 spinner instead.
 * The time-pressured "Extend" button must meet the 44px touch floor.
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

  it('keeps the Extend button itself above the 44px touch floor', () => {
    // min-h-[44px] must live on the Extend button's OWN className, not merely
    // somewhere in the file. The class sits in the <Button> opening tag right
    // before the "Extend" label, so anchor the match forward to ">Extend".
    expect(source).toMatch(/min-h-\[44px\][\s\S]{0,60}>\s*Extend/);
  });
});

/**
 * UX walk remediation 4.B — entry carts must not time-pressure the user.
 * No constant ticking countdown, and expiry must not strand the user by
 * redirecting to /shows mid-payment. Only the actionable near-expiry warning
 * (with one-tap Extend) remains.
 */
describe('CartSummary — de-panicked entry cart (4.B)', () => {
  it('shows no constant "Cart expires in" countdown', () => {
    expect(source).not.toContain('Cart expires in');
  });

  it('does not strand the user on expiry (no onExpired redirect)', () => {
    expect(source).not.toContain('onExpired');
  });

  it('still surfaces the actionable near-expiry warning and Extend', () => {
    expect(source).toContain('showWarning');
    expect(source).toMatch(/>\s*Extend/);
  });
});
