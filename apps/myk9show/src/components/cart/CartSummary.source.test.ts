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

  it('keeps the Extend button above the 44px touch floor', () => {
    expect(source).toMatch(/Extend[\s\S]{0,200}/);
    expect(source).toContain('min-h-[44px]');
  });
});
