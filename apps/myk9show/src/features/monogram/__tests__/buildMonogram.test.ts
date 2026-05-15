import { describe, expect, it } from 'vitest';
import { buildMonogram } from '../utils/buildMonogram';

describe('buildMonogram', () => {
  it('takes the first letter of each word, capped at 3 by default', () => {
    expect(buildMonogram('Bexar County Kennel Club')).toBe('BCK');
  });

  it('returns one letter for one-word names', () => {
    expect(buildMonogram('Monadnock')).toBe('M');
  });

  it('returns two letters for two-word names', () => {
    expect(buildMonogram('Bexar County')).toBe('BC');
  });

  it('honors a custom maxLetters', () => {
    expect(buildMonogram('Bexar County Kennel Club', 2)).toBe('BC');
    expect(buildMonogram('Bexar County Kennel Club', 4)).toBe('BCKC');
  });

  it('always uppercases', () => {
    expect(buildMonogram('mountain view obedience club')).toBe('MVO');
  });

  it('handles extra whitespace', () => {
    expect(buildMonogram('  Bexar    County   ')).toBe('BC');
  });

  it('returns "?" for null/undefined/empty inputs', () => {
    expect(buildMonogram(null)).toBe('?');
    expect(buildMonogram(undefined)).toBe('?');
    expect(buildMonogram('')).toBe('?');
    expect(buildMonogram('   ')).toBe('?');
  });
});
