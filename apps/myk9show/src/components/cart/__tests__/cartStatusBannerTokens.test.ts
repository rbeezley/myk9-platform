import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the cart expiration banners against regressing to a light-only Tailwind
 * palette. `bg-red-50 / text-red-700` and `bg-amber-50 / text-amber-700` have no
 * dark-mode counterpart, so they render near-black/low-contrast chips in dark mode
 * (the ShowStatusPill #666 bug class). CartSummary (the /cart route) must use
 * the theme-aware --destructive / --warning tokens, whose light/dark values are
 * split in index.css. (CartPreviewPanel was deleted as dead code — MP-25.)
 */
function read(relFromHere: string): string {
  return readFileSync(resolve(__dirname, relFromHere), 'utf8');
}

const sources = {
  CartSummary: read('../CartSummary.tsx'),
};

const cartItemCard = read('../CartItemCard.tsx');

describe.each(Object.entries(sources))('%s expiration banner tokens', (_name, source) => {
  it('styles the urgent (error) case with the --destructive token', () => {
    expect(source).toContain('bg-destructive/10 text-destructive border border-destructive/30');
  });

  it('styles the warning case with the --warning token', () => {
    expect(source).toContain('bg-warning/10 text-warning border border-warning/30');
  });

  it('never uses light-only red/amber palette classes (no dark-mode counterpart)', () => {
    expect(source).not.toContain('bg-red-50');
    expect(source).not.toContain('text-red-700');
    expect(source).not.toContain('bg-amber-50');
    expect(source).not.toContain('text-amber-700');
  });
});

/**
 * The same class of bug, one layer down and easier to miss: in dark mode
 * `--secondary`, `--card` and their foregrounds are pairwise identical
 * (#1e1c19 / #faf7f2), and `badgeVariants` sets `border-transparent` - so a
 * `variant="secondary"` badge on a card has no fill, no border and no
 * distinguishing text color. It measured 1.00:1 and simply was not there.
 *
 * That mattered here because the erased chip was "Wait list request", the only
 * per-line cue that a line will NOT be charged. The blocked badge
 * (`destructive`) kept its fill, so the hard-stop state survived while the
 * softer money-relevant one vanished.
 */
describe('CartItemCard line badges', () => {
  it('does not put a secondary-variant badge on a card surface', () => {
    expect(cartItemCard).not.toContain('<Badge variant="secondary"');
  });

  it('gives the wait-list badge the warning token pair, matching its meaning', () => {
    expect(cartItemCard).toContain('border-warning/40 bg-warning/10 text-warning');
  });

  it('gives the level badge a real boundary rather than a transparent border', () => {
    expect(cartItemCard).toContain('border-border text-muted-foreground');
  });

  it('keeps the blocked badge on the destructive variant', () => {
    expect(cartItemCard).toContain('<Badge variant="destructive"');
  });
});
