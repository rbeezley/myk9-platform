import { describe, expect, it } from 'vitest';
import { formatPlaceUpdatedAt, formatRingConflictNotice } from './myEntriesTodayCopy';

describe('myEntriesTodayCopy', () => {
  it('words a ring conflict as closeness to going in, never "same time"', () => {
    const text = formatRingConflictNotice('Rex next in Interior Novice');
    expect(text).toBe(
      'Close to going in at more than one ring. Also near the front: Rex next in Interior Novice. The ring steward can help.'
    );
    expect(text).not.toMatch(/same time|two of your dogs/i);
  });

  it('formats freshness on the trial clock', () => {
    const noonChicago = Date.parse('2026-10-24T17:05:00Z');
    expect(formatPlaceUpdatedAt(noonChicago, 'America/Chicago')).toBe('updated 12:05 PM');
    expect(formatPlaceUpdatedAt(noonChicago, 'America/Los_Angeles')).toBe('updated 10:05 AM');
  });
});
