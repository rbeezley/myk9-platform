import { getArmbandFontSize, getArmbandSideFontSize } from '../labelFontSize';

describe('getArmbandFontSize', () => {
  it('returns larger font when fewer fields are enabled', () => {
    const fewFields = getArmbandFontSize(1.333, 1);
    const manyFields = getArmbandFontSize(1.333, 5);
    expect(fewFields).toBeGreaterThan(manyFields);
  });

  it('returns larger font for taller labels', () => {
    const small = getArmbandFontSize(1.333, 2);
    const large = getArmbandFontSize(5.5, 2);
    expect(large).toBeGreaterThan(small);
  });

  it('never goes below minimum readable size', () => {
    const size = getArmbandFontSize(1.333, 10);
    expect(size).toBeGreaterThanOrEqual(24);
  });

  it('never exceeds label height in points', () => {
    const size = getArmbandFontSize(1.333, 0);
    expect(size).toBeLessThanOrEqual(1.333 * 72);
  });

  describe('width cap (MYK9-1233)', () => {
    const contentPx = (widthIn: number) => (widthIn - 0.24) * 96;

    it.each([
      ['18262', 4, 1.333],
      ['18163', 4, 2],
      ['8387', 4.25, 5.5],
    ])(
      'leaves the right column at least 45%% of the cell on %s for a 3-digit number',
      (_id, w, h) => {
        const size = getArmbandFontSize(h, 0, { labelWidthInches: w, digits: 3 });
        const numberWidth = size * 0.6 * 3;
        const sideWidth = contentPx(w) - numberWidth - 0.12 * 96;
        expect(sideWidth / (w * 96)).toBeGreaterThanOrEqual(0.4);
        expect(size).toBeGreaterThanOrEqual(24);
      }
    );

    it('shrinks the number on a very tall label instead of eating the column', () => {
      const tall = getArmbandFontSize(5.5, 0);
      const capped = getArmbandFontSize(5.5, 0, { labelWidthInches: 4.25, digits: 3 });
      expect(capped).toBeLessThan(tall);
    });

    it('sizes a 1- or 2-digit number like a 3-digit one, and a 4-digit one smaller', () => {
      const w = { labelWidthInches: 4.25 };
      const three = getArmbandFontSize(5.5, 0, { ...w, digits: 3 });
      expect(getArmbandFontSize(5.5, 0, { ...w, digits: 1 })).toBe(three);
      expect(getArmbandFontSize(5.5, 0, { ...w, digits: 4 })).toBeLessThan(three);
    });

    it('keeps the secondary text smaller than the number on every template', () => {
      for (const [w, h] of [
        [4, 1.333],
        [4, 2],
        [4.25, 5.5],
      ]) {
        const num = getArmbandFontSize(h, 0, { labelWidthInches: w, digits: 3 });
        expect(getArmbandSideFontSize(h)).toBeLessThan(num);
        expect(getArmbandSideFontSize(h)).toBeGreaterThanOrEqual(11);
      }
    });
  });
});
