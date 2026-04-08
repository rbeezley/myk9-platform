import { getArmbandFontSize } from '../labelFontSize';

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
});
