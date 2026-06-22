import { describe, expect, it } from 'vitest';
import { heritageColors } from '../tokens';

/**
 * Pins the heritage palette to WCAG AA. The original sweep mislabelled gold as
 * failing on paper (it passes, 4.52:1); the real failures are on the dark INK
 * band. These assertions lock the dark-surface tokens at >=4.5:1 on ink so the
 * palette can't silently regress, and confirm the paper-tuned tokens are
 * untouched.
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

describe('heritage palette contrast', () => {
  const { paper, ink, gold, quill, goldOnDark, paperMuted, paperSoft } = heritageColors;

  it('dark-band text tokens meet AA (>=4.5:1) on ink', () => {
    expect(contrast(goldOnDark, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(paperMuted, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(paperSoft, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('paper-surface text tokens still meet AA (untouched by the dark-band fix)', () => {
    expect(contrast(gold, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(quill, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('documents why a single gold token cannot serve both surfaces', () => {
    // gold-on-dark is intentionally lighter; it would FAIL on the paper surface,
    // which is exactly why it is a separate token rather than a darkened gold.
    expect(contrast(goldOnDark, paper)).toBeLessThan(AA_NORMAL);
    // and the paper gold fails on ink — the failure the sweep actually found.
    expect(contrast(gold, ink)).toBeLessThan(AA_NORMAL);
  });
});
