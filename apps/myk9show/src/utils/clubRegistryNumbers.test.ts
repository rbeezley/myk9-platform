import { describe, expect, it } from 'vitest';
import {
  formatClubRegistryNumbers,
  hasClubRegistryNumber,
  normalizeClubRegistryNumbers,
} from './clubRegistryNumbers';

describe('club registry numbers (MYK9-1235)', () => {
  it('trims every value and drops the blanks', () => {
    expect(normalizeClubRegistryNumbers({ AKC: ' 4521 ', UKC: '   ', ASCA: undefined })).toEqual({
      AKC: '4521',
    });
    expect(normalizeClubRegistryNumbers(null)).toEqual({});
  });

  it('counts a club as numbered when any one organization has a number', () => {
    expect(hasClubRegistryNumber({ AKC: '', UKC: '', ASCA: '' })).toBe(false);
    expect(hasClubRegistryNumber({ AKC: '  ', UKC: undefined })).toBe(false);
    expect(hasClubRegistryNumber({ UKC: 'U-1' })).toBe(true);
    expect(hasClubRegistryNumber({ AKC: '9' })).toBe(true);
  });

  it('formats AKC, UKC then ASCA with a middle dot, regardless of input order', () => {
    expect(formatClubRegistryNumbers({ ASCA: '3', AKC: '1', UKC: '2' })).toBe(
      'AKC #1 · UKC #2 · ASCA #3'
    );
    expect(formatClubRegistryNumbers({ UKC: 'U-9' })).toBe('UKC #U-9');
    expect(formatClubRegistryNumbers({})).toBe('');
    expect(formatClubRegistryNumbers(undefined)).toBe('');
  });
});
