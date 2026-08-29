import { describe, it, expect } from 'vitest';
import { formatArmbandDisplay, resolveStartNumber } from './armbandUtils';

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

describe('formatArmbandDisplay', () => {
  it('displays assigned armbands unchanged after trimming', () => {
    expect(formatArmbandDisplay(42)).toBe('42');
    expect(formatArmbandDisplay(' A12 ')).toBe('A12');
  });

  it('normalizes unassigned armbands to an em dash', () => {
    expect(formatArmbandDisplay(null)).toBe('—');
    expect(formatArmbandDisplay(undefined)).toBe('—');
    expect(formatArmbandDisplay('')).toBe('—');
    expect(formatArmbandDisplay('0')).toBe('—');
    expect(formatArmbandDisplay(0)).toBe('—');
    expect(formatArmbandDisplay('-')).toBe('—');
    expect(formatArmbandDisplay('--')).toBe('—');
  });
});
