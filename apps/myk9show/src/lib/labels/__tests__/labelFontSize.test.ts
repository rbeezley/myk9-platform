import {
  ARMBAND_NUMBER_LINE_HEIGHT,
  getArmbandFontSize,
  getArmbandLayout,
  getArmbandSideFontSize,
} from '../labelFontSize';

const TEMPLATES = [
  ['18262', 4, 1.333],
  ['18163', 4, 2],
  ['8387', 4.25, 5.5],
] as const;
const contentW = (w: number) => (w - 0.24) * 96;
const contentH = (h: number) => (h - 0.24) * 96;

describe('getArmbandLayout', () => {
  it('puts details beside the number on wide labels and under it on tall ones', () => {
    expect(getArmbandLayout(4, 1.333)).toBe('row');
    expect(getArmbandLayout(4, 2)).toBe('row');
    expect(getArmbandLayout(4.25, 5.5)).toBe('stacked');
  });
});

describe('getArmbandFontSize (MYK9-1233: as large as the label allows)', () => {
  it('fills the 1-1/3" label far beyond the old 48px', () => {
    // Known answer: 3 digits, width-bound at half of 361px content -> 103px.
    expect(getArmbandFontSize(4, 1.333, 3)).toBe(103);
  });

  it.each(TEMPLATES)('never overflows the content box on %s', (_id, w, h) => {
    for (const digits of [1, 2, 3, 4, 5]) {
      const size = getArmbandFontSize(w, h, digits);
      expect(size * ARMBAND_NUMBER_LINE_HEIGHT).toBeLessThanOrEqual(contentH(h));
      expect(size * 0.58 * digits).toBeLessThanOrEqual(contentW(w) + 0.5);
    }
  });

  it.each(TEMPLATES.filter(([, w, h]) => getArmbandLayout(w, h) === 'row'))(
    'leaves the details column at least 40%% of the cell on %s',
    (_id, w, h) => {
      const numberWidth = getArmbandFontSize(w, h, 3) * 0.58 * 3;
      const sideWidth = contentW(w) - numberWidth - 0.12 * 96;
      expect(sideWidth / (w * 96)).toBeGreaterThanOrEqual(0.4);
    }
  );

  it('stacked: leaves at least 45% of the height for the details', () => {
    const size = getArmbandFontSize(4.25, 5.5, 3);
    expect(size * ARMBAND_NUMBER_LINE_HEIGHT).toBeLessThanOrEqual(contentH(5.5) * 0.55);
    // And it is far larger than a side-by-side number on the same label would be.
    expect(size).toBeGreaterThan(200);
  });

  it('grows when the run has shorter armbands, shrinks for longer ones', () => {
    const three = getArmbandFontSize(4, 2, 3);
    expect(getArmbandFontSize(4, 2, 2)).toBeGreaterThan(three);
    expect(getArmbandFontSize(4, 2, 4)).toBeLessThan(three);
  });

  it('never goes below a readable minimum', () => {
    expect(getArmbandFontSize(4, 1.333, 12)).toBeGreaterThanOrEqual(24);
  });

  it.each(TEMPLATES)('keeps the details text smaller than the number on %s', (_id, w, h) => {
    expect(getArmbandSideFontSize(h)).toBeLessThan(getArmbandFontSize(w, h, 5));
    expect(getArmbandSideFontSize(h)).toBeGreaterThanOrEqual(11);
  });
});
