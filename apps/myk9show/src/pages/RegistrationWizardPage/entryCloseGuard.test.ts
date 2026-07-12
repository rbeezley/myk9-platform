import { describe, expect, it } from 'vitest';
import {
  getEntryCloseAvailability,
  getEntryCloseSubmitBlocker,
  getEntryOpenSubmitBlocker,
  getEntrySubmitBlocker,
} from './entryCloseGuard';

const OPEN_MESSAGE =
  'Entries have not opened yet for this show. Check back on the entry open date.';

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
});
