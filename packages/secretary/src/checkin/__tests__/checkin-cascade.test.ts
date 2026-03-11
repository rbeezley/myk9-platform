import { describe, it, expect } from 'vitest';
import { resolveCheckinCascade } from '../checkin-cascade';

describe('resolveCheckinCascade', () => {
  it('returns show setting when no overrides', () => {
    expect(resolveCheckinCascade(true)).toBe(true);
    expect(resolveCheckinCascade(false)).toBe(false);
  });

  it('trial overrides show', () => {
    expect(resolveCheckinCascade(true, false)).toBe(false);
    expect(resolveCheckinCascade(false, true)).toBe(true);
  });

  it('class overrides trial and show', () => {
    expect(resolveCheckinCascade(true, true, false)).toBe(false);
    expect(resolveCheckinCascade(false, false, true)).toBe(true);
  });

  it('null/undefined at class level falls through to trial', () => {
    expect(resolveCheckinCascade(true, false, null)).toBe(false);
    expect(resolveCheckinCascade(true, false, undefined)).toBe(false);
  });

  it('null at trial and class level falls through to show', () => {
    expect(resolveCheckinCascade(false, null, null)).toBe(false);
  });

  it('all null/undefined defaults to true', () => {
    expect(resolveCheckinCascade(null, null, null)).toBe(true);
    expect(resolveCheckinCascade(undefined, undefined, undefined)).toBe(true);
  });

  it('defaults to true when show is null', () => {
    expect(resolveCheckinCascade(null)).toBe(true);
  });
});
