import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { canRegisterForShow } from '../permissionValidation';
import type { Show } from '@/types/show-types';
import type { UserWithRoles } from '@/types/auth-types';

/**
 * TZ-boundary regression tests for canRegisterForShow.
 *
 * `startDate` / `entryCloseDate` are Postgres DATE columns serialized as bare
 * "YYYY-MM-DD" strings. Parsing them with raw `new Date("2026-05-15")` yields
 * UTC midnight, which is the *evening before* in every US timezone — so the
 * old code blocked registration up to a day early and closed entry a day early.
 * These tests pin the boundary in an America/New_York clock (UTC-4 in May).
 */
const originalTimezone = process.env.TZ;

const authedUser = { id: 'user-1', roles: [], permissions: [] } as unknown as UserWithRoles;

function makeShow(overrides: Partial<Show>): Show {
  return {
    // entry_open_date is a NOT-NULL DATE column; default it well in the past so
    // cases that don't exercise the open guard behave as "already open".
    entryOpenDate: '2026-05-01',
    startDate: '2026-05-15',
    entryCloseDate: '2026-05-15',
    status: 'Upcoming',
    ...overrides,
  } as Show;
}

describe('canRegisterForShow — DATE-column timezone boundary', () => {
  beforeEach(() => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it('allows registration the evening before the start date (the core bug)', () => {
    // 10pm the night before a show that starts 2026-05-15. Raw `new Date`
    // parsed the start as May-14 8pm EDT and blocked here; the fix must not.
    vi.setSystemTime(new Date('2026-05-14T22:00:00-04:00'));
    const show = makeShow({ startDate: '2026-05-15', entryCloseDate: '2026-05-15' });
    expect(canRegisterForShow(authedUser, show)).toBe(true);
  });

  it('keeps entry open through the entire close day (inclusive end-of-day)', () => {
    // Morning of the entry-close date — a bare toLocalDate compare would slam
    // entry shut at local midnight; end-of-day handling keeps it open.
    vi.setSystemTime(new Date('2026-05-15T10:00:00-04:00'));
    const show = makeShow({ startDate: '2026-05-16', entryCloseDate: '2026-05-15' });
    expect(canRegisterForShow(authedUser, show)).toBe(true);
  });

  it('blocks registration after the close day has fully passed', () => {
    vi.setSystemTime(new Date('2026-05-16T10:00:00-04:00'));
    const show = makeShow({ startDate: '2026-05-17', entryCloseDate: '2026-05-15' });
    expect(canRegisterForShow(authedUser, show)).toBe(false);
  });

  it('blocks registration once the show has started', () => {
    vi.setSystemTime(new Date('2026-05-15T10:00:00-04:00'));
    const show = makeShow({ startDate: '2026-05-15', entryCloseDate: '2026-05-20' });
    expect(canRegisterForShow(authedUser, show)).toBe(false);
  });

  it('blocks registration when the show is not in Upcoming status', () => {
    vi.setSystemTime(new Date('2026-05-14T22:00:00-04:00'));
    const show = makeShow({ status: 'in_progress' });
    expect(canRegisterForShow(authedUser, show)).toBe(false);
  });

  it('blocks anonymous (null) users', () => {
    vi.setSystemTime(new Date('2026-05-14T22:00:00-04:00'));
    expect(canRegisterForShow(null, makeShow({}))).toBe(false);
  });

  it('blocks registration the day before entries open', () => {
    // 10pm the evening before entries open. entryOpenDate is a bare DATE column,
    // so toLocalDate reads it as local midnight of the open day — the whole
    // evening before must stay blocked, mirroring entryStatusUtils' not_yet_open.
    vi.setSystemTime(new Date('2026-05-09T22:00:00-04:00'));
    const show = makeShow({
      entryOpenDate: '2026-05-10',
      startDate: '2026-05-20',
      entryCloseDate: '2026-05-19',
    });
    expect(canRegisterForShow(authedUser, show)).toBe(false);
  });

  it('allows registration from the morning entries open', () => {
    // Same show, now the morning of the open date — the open guard must not
    // over-block once local midnight of the open day has passed.
    vi.setSystemTime(new Date('2026-05-10T09:00:00-04:00'));
    const show = makeShow({
      entryOpenDate: '2026-05-10',
      startDate: '2026-05-20',
      entryCloseDate: '2026-05-19',
    });
    expect(canRegisterForShow(authedUser, show)).toBe(true);
  });
});
