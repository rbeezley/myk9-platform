import { describe, it, expect } from 'vitest';
import { normalizeCheckInStatus } from './myEntriesUtils';

describe('normalizeCheckInStatus', () => {
  it('passes through a real check-in status', () => {
    expect(normalizeCheckInStatus('checked-in')).toBe('checked-in');
    expect(normalizeCheckInStatus('at-gate')).toBe('at-gate');
  });

  it('maps null/undefined/empty and the "no-status" default to undefined (not checked in)', () => {
    expect(normalizeCheckInStatus(null)).toBeUndefined();
    expect(normalizeCheckInStatus(undefined)).toBeUndefined();
    expect(normalizeCheckInStatus('')).toBeUndefined();
    expect(normalizeCheckInStatus('no-status')).toBeUndefined();
  });
});
