import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the cart expiration banners against regressing to a light-only Tailwind
 * palette. `bg-red-50 / text-red-700` and `bg-amber-50 / text-amber-700` have no
 * dark-mode counterpart, so they render near-black/low-contrast chips in dark mode
 * (the ShowStatusPill #666 bug class). Both CartSummary (the /cart route) and
 * CartPreviewPanel (the header cart dropdown) must use the theme-aware
 * --destructive / --warning tokens, whose light/dark values are split in index.css.
 */
function read(relFromHere: string): string {
  return readFileSync(resolve(__dirname, relFromHere), 'utf8');
}

const sources = {
  CartPreviewPanel: read('../CartPreviewPanel.tsx'),
  CartSummary: read('../CartSummary.tsx'),
};

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
