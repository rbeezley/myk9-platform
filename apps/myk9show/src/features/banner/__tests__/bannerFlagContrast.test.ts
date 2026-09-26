/**
 * MYK9-765: a light club flag made flag-coloured text unreadable on paper,
 * and the final band's accents were light-on-light. `shows.brand_color`
 * accepts any 6-digit hex, so the derivation — not the club — has to
 * guarantee every text colour it hands out reaches WCAG AA (4.5:1).
 *
 * Contrast is measured with the repo's independent WCAG helper, never with
 * the derivation's own maths, so a bug in one cannot certify the other.
 */
import { describe, expect, it } from 'vitest';
import { deriveBannerBrandColors } from '../hooks/useBannerBrandColor';
import {
  BANNER_BAND_MUTED_OPACITY,
  BANNER_DEFAULT_FLAG,
  BANNER_PAPER,
  BANNER_PAPER_WARM,
} from '../../../../../../supabase/functions/_shared/bannerBrandColors.ts';
import { bannerColors } from '../tokens';
import { composite, contrastRatio, parseHex } from '@/styles/__tests__/contrast-test-utils';

const AA = 4.5;

/** The issue's measured spread: default teal down to yellow at 1.59:1. */
const ISSUE_FLAGS = ['#0d4d4f', '#1a5fb4', '#e01b24', '#ff7800', '#33d17a', '#f5c211'] as const;

/** Flags a club could type that stress the edges of the derivation. */
const EDGE_FLAGS = ['#ffffff', '#fafaf8', '#dcdcdc', '#c8c8c8', '#000000', '#00ffff'] as const;

const ALL_FLAGS = [...ISSUE_FLAGS, ...EDGE_FLAGS];

function ratio(a: string, b: string): number {
  return contrastRatio(parseHex(a), parseHex(b));
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = parseHex(hex).map(c => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('harness known answers', () => {
  it('measures black on white as 21:1 and a colour on itself as 1:1', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#f5c211', '#f5c211')).toBeCloseTo(1, 5);
    // The issue's own measurements, reproduced by this harness.
    expect(ratio('#0d4d4f', bannerColors.paper)).toBeCloseTo(9.17, 2);
    expect(ratio('#f5c211', bannerColors.paper)).toBeCloseTo(1.59, 2);
  });

  it('computes hue for a known colour', () => {
    expect(hsl('#ff0000').h).toBeCloseTo(0, 5);
    expect(hsl('#00ff00').h).toBeCloseTo(120, 5);
  });
});

/** Flag text sits on both paper surfaces; the warm Roster band is darker. */
function readsOnBothPapers(color: string): boolean {
  return ratio(color, bannerColors.paper) >= AA && ratio(color, bannerColors.paperWarm) >= AA;
}

describe('the shared derivation agrees with the web tokens', () => {
  it('uses the same default flag and paper surfaces as tokens.ts', () => {
    expect(BANNER_DEFAULT_FLAG).toBe(bannerColors.flag);
    expect(BANNER_PAPER).toBe(bannerColors.paper);
    expect(BANNER_PAPER_WARM).toBe(bannerColors.paperWarm);
  });
});

describe('deriveBannerBrandColors — flagText on paper (MYK9-765)', () => {
  it.each(ALL_FLAGS)('%s: flagText reaches 4.5:1 on paper and warm paper', flag => {
    const { flagText } = deriveBannerBrandColors(flag);
    expect(ratio(flagText, bannerColors.paper)).toBeGreaterThanOrEqual(AA);
    expect(ratio(flagText, bannerColors.paperWarm)).toBeGreaterThanOrEqual(AA);
  });

  it.each(ISSUE_FLAGS.filter(readsOnBothPapers))(
    '%s: a flag that already reads on paper is used unchanged',
    flag => {
      expect(deriveBannerBrandColors(flag).flagText).toBe(flag);
    }
  );

  it.each(ALL_FLAGS.filter(f => !readsOnBothPapers(f)))(
    '%s: a light flag is darkened minimally, keeping its hue, not blackened',
    flag => {
      const { flagText, flagDeep } = deriveBannerBrandColors(flag);
      const measured = ratio(flagText, bannerColors.paperWarm);
      // Minimal: stops just past the threshold rather than jumping to a
      // near-black, and walks lightness in HSL so hue and saturation hold —
      // unlike `flagDeep`, a linear mix toward black that greys the colour.
      expect(measured).toBeLessThan(AA + 0.3);
      expect(flagText).not.toBe('#000000');
      expect(flagText).not.toBe(flagDeep);
      const before = hsl(flag);
      const after = hsl(flagText);
      expect(after.l).toBeLessThan(before.l);
      if (before.s > 0.05) {
        expect(hueDistance(after.h, before.h)).toBeLessThanOrEqual(3);
      }
    }
  );
});

describe('deriveBannerBrandColors — text on the flag surfaces (MYK9-765)', () => {
  it.each(ISSUE_FLAGS)('%s: textOnFlag reaches 4.5:1 on the flag', flag => {
    const { textOnFlag } = deriveBannerBrandColors(flag);
    expect(ratio(textOnFlag, flag)).toBeGreaterThanOrEqual(AA);
  });

  it.each(ALL_FLAGS)('%s: paper text reaches 4.5:1 on the final band, even muted', flag => {
    const { flagDeep } = deriveBannerBrandColors(flag);
    expect(ratio(bannerColors.paper, flagDeep)).toBeGreaterThanOrEqual(AA);
    const muted = composite(
      parseHex(bannerColors.paper),
      BANNER_BAND_MUTED_OPACITY,
      parseHex(flagDeep)
    );
    expect(contrastRatio(muted, parseHex(flagDeep))).toBeGreaterThanOrEqual(AA);
  });

  it.each(ALL_FLAGS)('%s: the band accent reaches 4.5:1 on flagDeep', flag => {
    const { flagDeep, flagBrightOnDeep } = deriveBannerBrandColors(flag);
    expect(ratio(flagBrightOnDeep, flagDeep)).toBeGreaterThanOrEqual(AA);
  });

  it('keeps the default teal band exactly as designed', () => {
    const out = deriveBannerBrandColors(null);
    expect(out.flag).toBe(bannerColors.flag);
    expect(out.flagText).toBe(bannerColors.flag);
    expect(out.textOnFlag).toBe('#ffffff');
  });
});
