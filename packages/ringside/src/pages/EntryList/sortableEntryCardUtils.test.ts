import { describe, it, expect } from 'vitest';
import { getPlacementText, getStatusBorderClass } from './sortableEntryCardUtils';

describe('getStatusBorderClass for a disqualified entry', () => {
  const scored = (resultText: string) =>
    ({ isScored: true, resultText }) as unknown as Parameters<typeof getStatusBorderClass>[0];

  it('uses the non-qualifying border, never the generic scored one', () => {
    expect(getStatusBorderClass(scored('disqualified'))).toBe('result-ex');
    expect(getStatusBorderClass(scored('DQ'))).toBe('result-ex');
    expect(getStatusBorderClass(scored('excused'))).toBe('result-ex');
    expect(getStatusBorderClass(scored('mystery'))).toBe('scored');
  });
});

describe('getPlacementText', () => {
  it('returns the correct English ordinal, including the 11th to 13th teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(getPlacementText)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
      '112th',
    ]);
  });
});
