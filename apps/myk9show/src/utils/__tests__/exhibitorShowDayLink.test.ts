import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exhibitorShowDayHref } from '../exhibitorShowDayLink';

const base = { showId: 'show-1', trialDate: '2026-05-10', timezone: 'America/Los_Angeles' };

describe('exhibitorShowDayHref', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('goes to My Shows before the trial day', () => {
    vi.setSystemTime(new Date('2026-05-09T20:00:00Z'));
    expect(exhibitorShowDayHref(base)).toBe('/exhibitor/entries');
  });

  it('goes to Ringside on the trial day', () => {
    vi.setSystemTime(new Date('2026-05-10T20:00:00Z'));
    expect(exhibitorShowDayHref(base)).toBe('/at-show/show-1');
  });

  it('goes back to My Shows after the trial day', () => {
    vi.setSystemTime(new Date('2026-05-11T20:00:00Z'));
    expect(exhibitorShowDayHref(base)).toBe('/exhibitor/entries');
  });

  it("reckons the day in the trial's zone, not UTC or the device", () => {
    // 03:00 UTC on May 11 is still the evening of May 10 in Los Angeles.
    vi.setSystemTime(new Date('2026-05-11T03:00:00Z'));
    expect(exhibitorShowDayHref(base)).toBe('/at-show/show-1');
    expect(exhibitorShowDayHref({ ...base, timezone: 'Pacific/Auckland' })).toBe(
      '/exhibitor/entries'
    );
  });

  it('goes to My Shows when the day or the zone is unknown', () => {
    vi.setSystemTime(new Date('2026-05-10T20:00:00Z'));
    expect(exhibitorShowDayHref({ ...base, trialDate: '' })).toBe('/exhibitor/entries');
    expect(exhibitorShowDayHref({ ...base, trialDate: undefined })).toBe('/exhibitor/entries');
    expect(exhibitorShowDayHref({ ...base, timezone: undefined })).toBe('/exhibitor/entries');
  });

  it('never targets the class page', () => {
    vi.setSystemTime(new Date('2026-05-10T20:00:00Z'));
    expect(exhibitorShowDayHref(base)).not.toContain('/classes/');
  });
});
