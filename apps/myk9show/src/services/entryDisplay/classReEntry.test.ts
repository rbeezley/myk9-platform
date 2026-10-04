import { describe, expect, it } from 'vitest';
import {
  classReEntryReason,
  getClassReEntryBlock,
  strongestClassReEntryBlock,
} from './classReEntry';

describe('getClassReEntryBlock (MYK9-982)', () => {
  it.each([
    ['confirmed', 'none', 'entered'],
    ['pending', undefined, 'entered'],
    ['withdrawn', 'none', 'withdrawn'],
    ['cancelled', 'none', 'withdrawn'],
    ['scratched', 'none', 'withdrawn'],
    ['confirmed', 'pulled', 'withdrawn'],
    ['not_accepted', 'none', 'unavailable'],
  ])('%s / %s -> %s', (status, checkIn, expected) => {
    expect(getClassReEntryBlock(status, checkIn)).toBe(expected);
  });

  it('a live entry outranks a withdrawn one', () => {
    expect(strongestClassReEntryBlock(['withdrawn', 'entered'])).toBe('entered');
    expect(strongestClassReEntryBlock([])).toBeNull();
  });

  it('words the withdrawn block as the owner decided', () => {
    expect(classReEntryReason('withdrawn')).toBe('Withdrawn from this class');
  });
});
