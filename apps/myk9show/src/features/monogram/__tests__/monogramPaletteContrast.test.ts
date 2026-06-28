import { describe, expect, it } from 'vitest';
import { monogramColors } from '../tokens';

/**
 * Pins the Monogram landing palette to WCAG AA. The accent text tokens
 * (`bronze`, `mute`) drive 11px small-caps eyebrows, credentials, and meta
 * labels rendered directly on the paper surfaces — so they are body text and
 * must clear 4.5:1. The original values (#8a6938 / #7a6f5e) failed on both
 * `paper` and the deeper `paperDeep` card tone; these assertions lock the
 * darkened replacements so the palette can't silently regress.
 */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_NORMAL = 4.5;

describe('monogram palette contrast', () => {
  const { paper, paperDeep, ink, bronze, mute, quill, soft, leaf } = monogramColors;

  it('accent text tokens meet AA (>=4.5:1) on both paper surfaces', () => {
    expect(contrast(bronze, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(bronze, paperDeep)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(mute, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(mute, paperDeep)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('body + heading tokens still pass on paper (unchanged)', () => {
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(soft, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(quill, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('dark Final-CTA band text reads against ink (>=4.5:1)', () => {
    // The band switches accents to `leaf` and body to `paper` because the
    // paper-tuned bronze/soft tokens fail on the ink band.
    expect(contrast(leaf, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(paper, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
