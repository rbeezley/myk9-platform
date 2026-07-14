import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEntryCloseAvailability,
  getEntryCloseSubmitBlocker,
  getEntryWindowTimezone,
  getEntryOpenSubmitBlocker,
  getEntrySubmitBlocker,
} from './entryCloseGuard';

const OPEN_MESSAGE =
  'Entries have not opened yet for this show. Check back on the entry open date.';

afterEach(() => {
  vi.useRealTimers();
});

describe('getEntryCloseSubmitBlocker', () => {
  it('blocks exhibitor submit after entries have closed', () => {
    expect(
      getEntryCloseSubmitBlocker({
        startDate: '2026-08-01',
        entryCloseDate: '2026-07-15',
        today: '2026-07-16',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBe('Entries are closed for this show. Contact the trial secretary for late-entry help.');
  });

  it('does not block secretary late-entry mode after close', () => {
    expect(
      getEntryCloseSubmitBlocker({
        startDate: '2026-08-01',
        entryCloseDate: '2026-07-15',
        today: '2026-07-16',
        isLateEntryMode: true,
        workflowMode: 'secretary_new',
      })
    ).toBeNull();
  });

  it('does not block the demo-style close date after show start', () => {
    expect(
      getEntryCloseSubmitBlocker({
        startDate: '2026-08-01',
        entryCloseDate: '2026-09-01',
        today: '2026-08-02',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBeNull();
  });

  it('returns the closed-entry recovery path for direct wizard blocking', () => {
    expect(
      getEntryCloseAvailability({
        showId: 'show-1',
        startDate: '2026-08-01',
        entryCloseDate: '2026-07-15',
        today: '2026-07-16',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toStrictEqual({
      canEnter: false,
      unavailableReason: 'closed',
      reason: 'Entries are closed for this show. Contact the trial secretary for late-entry help.',
      recoveryHref: '/messages/show-1',
    });
  });
});

describe('getEntryOpenSubmitBlocker', () => {
  it('blocks exhibitor submit before entries open', () => {
    expect(
      getEntryOpenSubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-09',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBe(OPEN_MESSAGE);
  });

  it('allows exhibitor submit on the open day (inclusive)', () => {
    expect(
      getEntryOpenSubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-10',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBeNull();
  });

  it('allows exhibitor submit after entries open', () => {
    expect(
      getEntryOpenSubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-11',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBeNull();
  });

  it('still blocks an exhibitor before open even with the URL late-entry flag set', () => {
    // isLateEntryMode is derived purely from ?source=show-desk&entryMode=late,
    // which any exhibitor can append. "Late entry" is a post-close concept, so
    // the open guard must not honor it — only RBAC-derived organizer modes pass.
    expect(
      getEntryOpenSubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-09',
        isLateEntryMode: true,
        workflowMode: 'exhibitor',
      })
    ).toBe(OPEN_MESSAGE);
  });

  it('does not block organizer workflows before entries open', () => {
    expect(
      getEntryOpenSubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-09',
        isLateEntryMode: false,
        workflowMode: 'secretary_new',
      })
    ).toBeNull();
  });

  it('does not block when entryOpenDate is missing', () => {
    expect(
      getEntryOpenSubmitBlocker({
        entryCloseDate: '2026-07-20',
        today: '2026-07-09',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBeNull();
  });

  it('uses the show timezone, not the browser day, before entries open', () => {
    vi.useFakeTimers();
    // 2026-07-10 00:30 in New York, but still 2026-07-09 21:30 in Los Angeles.
    vi.setSystemTime(new Date('2026-07-10T04:30:00.000Z'));

    expect(
      getEntryOpenSubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        entryWindowTimezone: 'America/Los_Angeles',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBe(OPEN_MESSAGE);
  });
});

describe('getEntrySubmitBlocker', () => {
  it('blocks exhibitor before open even when the close date is comfortably ahead', () => {
    expect(
      getEntrySubmitBlocker({
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-09',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBe(OPEN_MESSAGE);
  });

  it('surfaces not-yet-open through getEntryCloseAvailability', () => {
    expect(
      getEntryCloseAvailability({
        showId: 'show-1',
        entryOpenDate: '2026-07-10',
        entryCloseDate: '2026-07-20',
        today: '2026-07-09',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toStrictEqual({
      canEnter: false,
      unavailableReason: 'not_yet_open',
      reason: OPEN_MESSAGE,
      recoveryHref: '/messages/show-1',
    });
  });

  it('keeps close day open in the show timezone even after midnight elsewhere', () => {
    vi.useFakeTimers();
    // 2026-07-21 00:30 in New York, but still 2026-07-20 21:30 in Los Angeles.
    vi.setSystemTime(new Date('2026-07-21T04:30:00.000Z'));

    expect(
      getEntrySubmitBlocker({
        entryOpenDate: '2026-07-01',
        entryCloseDate: '2026-07-20',
        entryWindowTimezone: 'America/Los_Angeles',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBeNull();
  });
});

describe('getEntryWindowTimezone', () => {
  it('uses the earliest dated trial timezone, matching the server primary-trial rule', () => {
    expect(
      getEntryWindowTimezone([
        { id: 'trial-b', date: null, timezone: 'America/New_York' },
        { id: 'trial-c', date: '2026-07-11', timezone: 'America/Chicago' },
        { id: 'trial-a', date: '2026-07-10', timezone: 'America/Los_Angeles' },
      ])
    ).toBe('America/Los_Angeles');
  });

  it('falls back to America/New_York when no trial timezone is available', () => {
    expect(getEntryWindowTimezone([])).toBe('America/New_York');
  });
});
