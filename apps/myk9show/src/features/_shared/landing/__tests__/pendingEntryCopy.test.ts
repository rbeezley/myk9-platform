import { describe, expect, it } from 'vitest';
import { pendingEntryCopy } from '../pendingEntryCopy';

const tz = 'America/Chicago';
const now = new Date('2026-11-18T18:00:00Z');

describe('pendingEntryCopy', () => {
  it('names a future opening date for not_yet_open, even with classes assigned', () => {
    const copy = pendingEntryCopy({
      hasEntryClassInventory: true,
      entryPendingReason: 'not_yet_open',
      entryOpenDate: '2027-01-05T00:00:00+00:00',
      timezone: tz,
      now,
    });
    expect(copy.kind).toBe('not-open');
    expect(copy.nav).toBe('Opens Jan 5');
    expect(copy.sentence).toBe('Entries open January 5.');
    expect(copy.headlineLead).toBe('Entries open');
    expect(copy.headlineAccent).toBe('Jan 5');
  });

  it('says card entries are paused, with no reason, for card_paused (MYK9-2192)', () => {
    const copy = pendingEntryCopy({
      entryPendingReason: 'card_paused',
      entryOpenDate: '2027-01-05T00:00:00+00:00',
      timezone: tz,
      now,
    });
    expect(copy.sentence).toBe('Card entries are paused. Contact the secretary.');
    expect(JSON.stringify(copy).toLowerCase()).not.toMatch(/stripe|payout|bank|money/);
  });

  it('is neutral for not_yet_open when no date is known', () => {
    const copy = pendingEntryCopy({
      entryPendingReason: 'not_yet_open',
      entryOpenDate: null,
      timezone: tz,
      now,
    });
    expect(copy.nav).toBe('Not open yet');
    expect(copy.sentence).toBe('Entries are not open yet.');
  });

  it('is neutral for not_yet_open when the open date has already passed', () => {
    const copy = pendingEntryCopy({
      entryPendingReason: 'not_yet_open',
      entryOpenDate: '2026-11-01T00:00:00+00:00',
      timezone: tz,
      now,
    });
    expect(copy.nav).toBe('Not open yet');
  });

  it('treats an open date of today as not in the future', () => {
    const copy = pendingEntryCopy({
      entryPendingReason: 'not_yet_open',
      entryOpenDate: '2026-11-18',
      timezone: tz,
      now,
    });
    expect(copy.nav).toBe('Not open yet');
  });

  it('never dates window_unknown, with a past or a future date', () => {
    for (const entryOpenDate of ['2026-01-05', '2027-01-05']) {
      const copy = pendingEntryCopy({
        entryPendingReason: 'window_unknown',
        entryOpenDate,
        timezone: tz,
        now,
      });
      expect(copy.nav).toBe('Not open yet');
    }
  });

  it('never dates online_setting_unknown', () => {
    const copy = pendingEntryCopy({
      entryPendingReason: 'online_setting_unknown',
      entryOpenDate: '2027-01-05',
      timezone: tz,
      now,
    });
    expect(copy.nav).toBe('Not open yet');
  });

  it('prefers a pending reason over missing classes', () => {
    const copy = pendingEntryCopy({
      hasEntryClassInventory: false,
      entryPendingReason: 'not_yet_open',
      entryOpenDate: '2027-01-05',
      timezone: tz,
      now,
    });
    expect(copy.kind).toBe('not-open');
  });

  it('uses missing-class copy only for a confirmed empty inventory with no reason', () => {
    const copy = pendingEntryCopy({ hasEntryClassInventory: false, timezone: tz, now });
    expect(copy.kind).toBe('no-classes');
    expect(copy.nav).toBe('Classes pending');
  });

  it('does not claim missing classes when inventory is unknown', () => {
    const copy = pendingEntryCopy({ hasEntryClassInventory: null, timezone: tz, now });
    expect(copy.kind).toBe('not-open');
  });
});

describe('pendingEntryCopy across the opening day in a non-UTC zone', () => {
  const open = '2026-11-18T00:00:00+00:00';
  const copyAt = (instant: string) =>
    pendingEntryCopy({
      entryPendingReason: 'not_yet_open',
      entryOpenDate: open,
      timezone: tz,
      now: new Date(instant),
    });

  it('dates the opening the evening before it, while UTC already reads the day itself', () => {
    expect(copyAt('2026-11-18T05:00:00Z').nav).toBe('Opens Nov 18');
  });

  it('stops dating it from local midnight on the opening day', () => {
    expect(copyAt('2026-11-18T06:00:00Z').nav).toBe('Not open yet');
  });

  it('stays neutral the day after', () => {
    expect(copyAt('2026-11-19T18:00:00Z').nav).toBe('Not open yet');
  });
});
