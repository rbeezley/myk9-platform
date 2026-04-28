import { describe, it, expect } from 'vitest';
import { computeArmbandAssignments, resolveStartNumber } from './armbandUtils';

describe('computeArmbandAssignments', () => {
  it('assigns sequential numbers starting from startNumber', () => {
    const result = computeArmbandAssignments(['dog-1', 'dog-2', 'dog-3'], 5);
    expect(result).toEqual([
      { dogId: 'dog-1', armband: '5' },
      { dogId: 'dog-2', armband: '6' },
      { dogId: 'dog-3', armband: '7' },
    ]);
  });

  it('returns empty array for no dogs', () => {
    expect(computeArmbandAssignments([], 1)).toEqual([]);
  });

  it('starts at 1 by default', () => {
    const result = computeArmbandAssignments(['dog-a'], 1);
    expect(result[0].armband).toBe('1');
  });
});

describe('resolveStartNumber', () => {
  it('returns startNumber when no existing armbands', () => {
    expect(resolveStartNumber(null, 1)).toBe(1);
    expect(resolveStartNumber(undefined, 5)).toBe(5);
  });

  it('uses max existing + 1 when higher than startNumber', () => {
    expect(resolveStartNumber('10', 1)).toBe(11);
  });

  it('uses startNumber when higher than max existing + 1', () => {
    expect(resolveStartNumber('3', 10)).toBe(10);
  });

  it('ignores non-numeric existing armbands', () => {
    expect(resolveStartNumber('ABC', 1)).toBe(1);
  });
});
