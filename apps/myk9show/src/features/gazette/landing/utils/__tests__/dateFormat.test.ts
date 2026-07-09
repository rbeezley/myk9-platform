import { afterEach, describe, expect, it } from 'vitest';
import { formatDateInTimezone, formatMastheadDate, formatJourneyDate } from '../dateFormat';

/**
 * TZ-01 (money-path-hardening-remainder, Group 5): these formatters must
 * render identically regardless of the *device's* local timezone — all
 * three explicitly pass a trial `timezone` into `Intl`/`toLocaleDateString`,
 * so a leaking device-local default would be a regression.
 *
 * We simulate different "devices" by mutating `process.env.TZ` mid-test —
 * Node re-reads it per `Intl`/`Date` call, so this is a faithful proxy for
 * "viewer's local timezone" without needing separate CI machines. Dates are
 * chosen on the US spring-forward / fall-back DST boundaries, where a
 * device-local leak is most likely to shift the calendar day.
 */
describe('dateFormat DST boundaries', () => {
  const originalTZ = process.env.TZ;
  const DEVICE_ZONES = ['Pacific/Kiritimati', 'Pacific/Midway', 'UTC', 'America/Los_Angeles'];

  afterEach(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  function acrossDevices<T>(fn: () => T): T[] {
    return DEVICE_ZONES.map(tz => {
      process.env.TZ = tz;
      return fn();
    });
  }

  describe('spring-forward boundary (2026-03-08, America/New_York)', () => {
    // 07:30 UTC = 02:30 America/New_York on the morning clocks skip 2am -> 3am.
    const iso = '2026-03-08T07:30:00.000Z';

    it('formatDateInTimezone (long) is identical across device timezones', () => {
      const results = acrossDevices(() => formatDateInTimezone(iso, 'America/New_York', 'long'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('Sunday, March 8, 2026');
    });

    it('formatDateInTimezone (short) is identical across device timezones', () => {
      const results = acrossDevices(() => formatDateInTimezone(iso, 'America/New_York', 'short'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('Mar 8, 2026');
    });

    it('formatMastheadDate is identical across device timezones', () => {
      const results = acrossDevices(() => formatMastheadDate(iso, 'America/New_York'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('SUNDAY, MARCH 8, 2026');
    });

    it('formatJourneyDate is identical across device timezones', () => {
      const results = acrossDevices(() => formatJourneyDate(iso, 'America/New_York'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('Mar 8');
    });
  });

  describe('fall-back boundary (2026-11-01, America/New_York)', () => {
    // 06:30 UTC = 02:30 America/New_York on the morning clocks repeat 1am -> 2am.
    const iso = '2026-11-01T06:30:00.000Z';

    it('formatDateInTimezone (long) is identical across device timezones', () => {
      const results = acrossDevices(() => formatDateInTimezone(iso, 'America/New_York', 'long'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('Sunday, November 1, 2026');
    });

    it('formatMastheadDate is identical across device timezones', () => {
      const results = acrossDevices(() => formatMastheadDate(iso, 'America/New_York'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('SUNDAY, NOVEMBER 1, 2026');
    });

    it('formatJourneyDate is identical across device timezones', () => {
      const results = acrossDevices(() => formatJourneyDate(iso, 'America/New_York'));
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('Nov 1');
    });
  });
});
