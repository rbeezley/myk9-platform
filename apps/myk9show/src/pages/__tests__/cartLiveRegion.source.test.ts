import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The removal announcement depends on one live-region NODE surviving the
 * transition to the empty cart.
 *
 * Screen readers announce changes to a live region that is already mounted;
 * a region that appears already-populated is silent. Removing the last item
 * swaps CartPage's populated branch for its empty branch, so a region rendered
 * separately inside each branch remounts and says nothing - and a single-entry
 * cart is the common case.
 *
 * All three branches return the same root element, so React reconciles the
 * region in place as long as it is that root's FIRST child everywhere. That
 * placement is the contract; asserting it at the source is the cheapest way to
 * pin it, since driving the transition needs a reactive store the page-level
 * harness does not provide.
 */
const source = readFileSync(resolve(__dirname, '../CartPage.tsx'), 'utf8');

const ROOT = '<div className="bg-background pt-6">';

describe('CartPage live region', () => {
  it('renders the live region as the first child of every branch root', () => {
    const roots = source.split(ROOT).slice(1);
    expect(roots.length).toBe(3);
    for (const branch of roots) {
      expect(branch.trimStart().startsWith('{liveRegion}')).toBe(true);
    }
  });

  it('declares exactly one live region', () => {
    expect(source.match(/aria-live="polite"/g)?.length).toBe(1);
  });

  it('announces the empty transition, which has no heading to focus', () => {
    expect(source).toContain('Your cart is now empty.');
  });
});
