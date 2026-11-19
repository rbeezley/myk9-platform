import { describe, expect, it } from 'vitest';
import { msUntilEntryOpenBoundary } from '../entryOpenBoundary';

const tz = 'America/Chicago';
const HOUR = 60 * 60 * 1000;

describe('msUntilEntryOpenBoundary', () => {
  it('waits for the next trial-local midnight when the open day is a calendar day ahead', () => {
    // 21:00 Chicago on Nov 17 (CST, UTC-6): midnight is 3 hours away.
    const wait = msUntilEntryOpenBoundary('2026-11-20', tz, new Date('2026-11-18T03:00:00Z'));
    expect(wait).not.toBeNull();
    expect(Math.abs(wait! - 3 * HOUR)).toBeLessThanOrEqual(1000);
  });

  it('is null on the opening day itself and after it', () => {
    expect(msUntilEntryOpenBoundary('2026-11-18', tz, new Date('2026-11-18T06:00:00Z'))).toBeNull();
    expect(msUntilEntryOpenBoundary('2026-11-18', tz, new Date('2026-11-19T18:00:00Z'))).toBeNull();
  });

  it('waits until the instant for a real timestamp', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(msUntilEntryOpenBoundary('2026-11-18T15:30:00Z', tz, now)).toBe(3.5 * HOUR);
    expect(msUntilEntryOpenBoundary('2026-11-18T11:00:00Z', tz, now)).toBeNull();
  });

  it('is null for a missing or unparseable date', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(msUntilEntryOpenBoundary(null, tz, now)).toBeNull();
    expect(msUntilEntryOpenBoundary('not a date', tz, now)).toBeNull();
  });
});
