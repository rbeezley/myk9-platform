import { describe, it, expect } from 'vitest';
import { formatArmband } from './armband';
import { armbandSortKey, compareByRunOrder } from '../pages/EntryList/runQueue';

describe('formatArmband', () => {
  it('shows the number', () => {
    expect(formatArmband(142)).toBe('142');
    expect(formatArmband('7')).toBe('7');
  });

  it('shows an em dash for no armband, never 0', () => {
    expect(formatArmband(null)).toBe('—');
    expect(formatArmband(undefined)).toBe('—');
    expect(formatArmband('')).toBe('—');
  });

  it('keeps a real armband of 0 as 0 (it is a value, not a stand-in)', () => {
    expect(formatArmband(0)).toBe('0');
  });
});

describe('armbandSortKey / compareByRunOrder', () => {
  it('orders an entry with no armband ahead of numbered ones without throwing', () => {
    expect(armbandSortKey(null)).toBe(0);
    const a = { id: 'a', armband: null };
    const b = { id: 'b', armband: 5 };
    expect(compareByRunOrder(a, b)).toBeLessThan(0);
  });
});
