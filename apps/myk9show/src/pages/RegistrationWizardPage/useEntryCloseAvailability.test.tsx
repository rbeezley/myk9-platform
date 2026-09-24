/**
 * MYK9-676. The wizard's entry-close gate must decide in the show's own zone,
 * the one `submit_show_entries` uses, not in America/New_York.
 *
 * The server rule (migration 20260918211700, `submit_show_entries`):
 *
 *   closed  <=>  (now() AT TIME ZONE v_show_tz)::date
 *                  > (v_show_close AT TIME ZONE 'UTC')::date
 *
 * with `v_show_tz` the first trial's zone (`ORDER BY t.date NULLS LAST, t.id`).
 * `serverSaysClosed` below restates that expression so each boundary case
 * asserts the client and the server AGREE, not just that the client says X.
 *
 * Mutation check: make the hook pass 'America/New_York' (what `show.trials`,
 * always `[]`, resolved to) instead of the hook's zone and the 23:30 CT case
 * goes red: the client refuses an entry the server would accept.
 *
 * The trial store and the replication context are stubbed per case behind
 * `vi.resetModules()`, so this file holds no module-scope mutable state.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';

const SHOW_ID = 'show-central';
// `shows.entry_close_date` is timestamptz stored at UTC midnight of the close
// DAY; PostgREST serializes it like this.
const ENTRY_CLOSE = '2026-10-01T00:00:00+00:00';
const CHICAGO = 'America/Chicago';

function calendarDateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function serverSaysClosed(now: Date, closeIso: string, showTz: string): boolean {
  return calendarDateIn(now, showTz) > calendarDateIn(new Date(closeIso), 'UTC');
}

async function clientCanEnterAt(now: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.resetModules();
  vi.doMock('@/store/trialStore', () => ({
    useTrialStore: (selector: (state: unknown) => unknown) =>
      selector({
        trials: [{ id: 'trial-1', showId: SHOW_ID, trialDate: '2026-10-17', timezone: CHICAGO }],
        trialsReadStatus: 'ready',
      }),
  }));
  const { ReplicationSyncContext } = await import('@/context/ReplicationSyncContext');
  const { useEntryCloseAvailability } = await import('./useEntryCloseAvailability');

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ReplicationSyncContext.Provider,
      {
        value: {
          status: {
            isSyncing: false,
            lastSyncAt: null,
            error: null,
            tablesStatus: { trials: 'success' },
          },
          triggerSync: async () => {},
          syncTable: async () => {},
        },
      },
      children
    );

  const { result } = renderHook(
    () =>
      useEntryCloseAvailability({
        showId: SHOW_ID,
        show: {
          startDate: '2026-10-17T00:00:00+00:00',
          entryOpenDate: '2026-09-01T00:00:00+00:00',
          entryCloseDate: ENTRY_CLOSE,
        },
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      }),
    { wrapper }
  );
  return result.current.canEnter;
}

afterEach(() => {
  vi.doUnmock('@/store/trialStore');
  vi.resetModules();
  vi.useRealTimers();
});

describe('useEntryCloseAvailability at the close boundary of a Central-time show', () => {
  it('23:30 CT on close day: still open, and the server agrees', async () => {
    // 04:30 UTC Oct 2 = 23:30 CDT Oct 1 = 00:30 EDT Oct 2.
    const now = new Date('2026-10-02T04:30:00.000Z');
    expect(serverSaysClosed(now, ENTRY_CLOSE, CHICAGO)).toBe(false);
    await expect(clientCanEnterAt(now)).resolves.toBe(true);
  });

  it('00:30 CT the day after: closed, and the server agrees', async () => {
    const now = new Date('2026-10-02T05:30:00.000Z');
    expect(serverSaysClosed(now, ENTRY_CLOSE, CHICAGO)).toBe(true);
    await expect(clientCanEnterAt(now)).resolves.toBe(false);
  });
});
