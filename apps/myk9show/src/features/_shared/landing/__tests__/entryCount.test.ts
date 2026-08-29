import { describe, expect, it } from 'vitest';
import { entryCapacityPercent, formatEntryCount } from '../entryCount';

describe('public landing entry counts', () => {
  it('renders an unavailable count as an em dash instead of zero', () => {
    expect(formatEntryCount(null)).toBe('—');
    expect(formatEntryCount(0)).toBe('0');
  });

  it('does not calculate a capacity claim from an unavailable count', () => {
    expect(entryCapacityPercent(null, 100)).toBeNull();
    expect(entryCapacityPercent(25, 100)).toBe(25);
    expect(entryCapacityPercent(25, null)).toBeNull();
  });
});
