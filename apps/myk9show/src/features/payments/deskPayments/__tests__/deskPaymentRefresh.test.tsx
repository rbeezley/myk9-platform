import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/context/authContextObject';
import type { AuthContextType } from '@/context/authContextTypes';
import type { DeskPaymentDeps } from '../deskPaymentDeps';
import {
  announceDeskPaymentsRecorded,
  DESK_PAYMENTS_RECORDED_EVENT,
  type DeskPaymentsRecordedDetail,
} from '../deskPaymentEvents';
import type { DeskPaymentsTable, StoredDeskPayment } from '../DeskPaymentsTable';
import type { LocalDeskPayment } from '../deskPaymentTypes';
import { DESK_PAYMENT_LINES_POLL_MS, useDeskPaymentLines } from '../useDeskPaymentLines';
import { useDeskPaymentRefresh, useReloadOnDeskPaymentsRecorded } from '../useDeskPaymentRefresh';

function payment(id: string, enrollmentId: string): LocalDeskPayment {
  return {
    id,
    showId: 'show-1',
    enrollmentId,
    exhibitorName: 'Jane Smith',
    amount: 25,
    method: 'cash',
    receivedOn: '2026-11-26',
    reference: null,
    receivedAt: '2026-11-26T15:14:00.000Z',
    sendBegun: false,
  };
}

describe('refresh after a replayed desk payment (MYK9-2479)', () => {
  it("refreshes the show's ledger read, so an open close-out is current without a reload", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    renderHook(() => useDeskPaymentRefresh(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    act(() => {
      void announceDeskPaymentsRecorded(['show-1']);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['show-payments', 'show-1'] });
  });

  it("reloads Entry Management's form money for the show on screen only", () => {
    const loadEntries = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useReloadOnDeskPaymentsRecorded('show-1', loadEntries));

    act(() => {
      void announceDeskPaymentsRecorded(['show-2']);
    });
    expect(loadEntries).not.toHaveBeenCalled();

    act(() => {
      void announceDeskPaymentsRecorded(['show-1']);
    });
    expect(loadEntries).toHaveBeenCalledWith('show-1');
  });

  // Codex round 2 on #4461: whoever announces knows when the form money is current again.
  it('the announcement resolves only once the reload it started is done', async () => {
    let done: () => void = () => undefined;
    const loadEntries = vi.fn(() => new Promise<void>(resolve => (done = resolve)));
    renderHook(() => useReloadOnDeskPaymentsRecorded('show-1', loadEntries));
    let finished = false;

    act(() => {
      void announceDeskPaymentsRecorded(['show-1']).then(() => (finished = true));
    });
    await act(async () => undefined);
    expect(finished).toBe(false);

    await act(async () => done());
    expect(finished).toBe(true);
  });
});

describe('useDeskPaymentLines (MYK9-2479)', () => {
  function setup(listForShow?: DeskPaymentsTable['listForShow']) {
    let stored: StoredDeskPayment[] = [
      { payment: payment('pay-1', 'enr-1'), owner: 'secretary-a', acknowledged: false },
      { payment: payment('pay-2', 'enr-2'), owner: 'secretary-a', acknowledged: false },
    ];
    let retries = 0;
    const queued = (rowId: string) => ({ id: `mut-${rowId}`, rowId, retries });
    const deps = {
      table: {
        listForShow: listForShow ?? vi.fn(async () => stored),
        subscribe: vi.fn(() => () => undefined),
        settle: vi.fn(),
      } as unknown as DeskPaymentsTable,
      queue: {
        getPendingMutationsForTable: vi.fn(async () => stored.map(s => queued(s.payment.id))),
        getFailedMutations: vi.fn(async () => []),
        sendRowNow: vi.fn(),
        retryFailedMutation: vi.fn(),
      },
      send: vi.fn(),
      canReadLedger: vi.fn(),
      ledgerIds: vi.fn(),
      isOnline: () => true,
      now: () => Date.now(),
    } as unknown as DeskPaymentDeps;
    let userId = 'secretary-a';
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthContext.Provider value={{ user: { id: userId } } as unknown as AuthContextType}>
        {children}
      </AuthContext.Provider>
    );
    const view = renderHook(() => useDeskPaymentLines('show-1', 'enr-1', deps), { wrapper });
    return {
      ...view,
      deps,
      setStored: (next: StoredDeskPayment[]) => {
        stored = next;
      },
      /** The queue retried it: a pass with only retryable failures announces nothing. */
      retryQuietly: () => {
        retries += 1;
      },
      switchAccount: (next: string) => {
        userId = next;
        view.rerender();
      },
    };
  }

  it("shows only this form's payments, and re-reads when the queue changes", async () => {
    const { result, setStored } = setup();
    await waitFor(() => expect(result.current.lines.map(l => l.payment.id)).toEqual(['pay-1']));
    expect(result.current.lines[0]?.state).toBe('waiting');

    setStored([]);
    act(() => {
      window.dispatchEvent(new CustomEvent('replication:upload-complete', { detail: {} }));
    });

    await waitFor(() => expect(result.current.lines).toEqual([]));
  });

  // Codex round 1 on #4461: a retry-only upload pass fires no event, and another tab's
  // events never reach this one, so a shown line re-reads on its own.
  it('a quiet retry still updates a shown line within 15 seconds', async () => {
    // Only the hook's interval is faked; vi.waitFor polls on the real clock.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const { result, retryQuietly } = setup();
      await vi.waitFor(() => expect(result.current.lines[0]?.state).toBe('waiting'));

      retryQuietly();
      act(() => {
        vi.advanceTimersByTime(DESK_PAYMENT_LINES_POLL_MS);
      });

      await vi.waitFor(() => expect(result.current.lines[0]?.state).toBe('unconfirmed'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('coming back to the tab re-reads its lines', async () => {
    const { result, retryQuietly } = setup();
    await waitFor(() => expect(result.current.lines[0]?.state).toBe('waiting'));

    retryQuietly();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.lines[0]?.state).toBe('unconfirmed'));
  });

  it('a failed re-read keeps the known lines, stops their actions and says so', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.lines).toHaveLength(1));

    vi.mocked(deps.table.listForShow).mockRejectedValueOnce(new Error('IndexedDB read failed'));
    act(() => {
      window.dispatchEvent(new CustomEvent('replication:upload-complete', { detail: {} }));
    });

    await waitFor(() => expect(result.current.unreadable).toBe(true));
    expect(result.current.lines.map(l => l.payment.id)).toEqual(['pay-1']);
  });

  it('a first read that fails says the device could not read, not that nothing is saved', async () => {
    const listForShow = vi.fn().mockRejectedValue(new Error('IndexedDB read failed'));
    const { result } = setup(listForShow);

    await waitFor(() => expect(result.current.unreadable).toBe(true));
    expect(result.current.lines).toEqual([]);
  });

  // Codex round 2 on #4461: another tab settled it, so no event reaches this one. The line
  // going is the signal: this form's money is refreshed whichever tab settled it, and
  // the form says its balance is refreshing until the reload is done.
  it("a line that goes with no event here refreshes its show's money, flagged until done", async () => {
    let finish: () => void = () => undefined;
    const heard = vi.fn((event: Event) => {
      const { waitFor: wait } = (event as CustomEvent<DeskPaymentsRecordedDetail>).detail;
      wait(new Promise<void>(resolve => (finish = resolve)));
    });
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, heard);
    try {
      const { result, setStored } = setup();
      await waitFor(() => expect(result.current.lines).toHaveLength(1));
      expect(result.current.balanceRefreshing).toBe(false);

      setStored([]);
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await waitFor(() => expect(result.current.balanceRefreshing).toBe(true));
      expect(heard).toHaveBeenCalledTimes(1);
      expect((heard.mock.calls[0]![0] as CustomEvent).detail.showIds).toEqual(['show-1']);
      await act(async () => finish());
      expect(result.current.balanceRefreshing).toBe(false);
    } finally {
      window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, heard);
    }
  });

  it("another form's line going, or an account switch, refreshes nothing here", async () => {
    const heard = vi.fn();
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, heard);
    try {
      const { result, setStored, switchAccount, deps } = setup();
      await waitFor(() => expect(result.current.lines).toHaveLength(1));

      // enr-2's payment goes: not a line this form showed.
      setStored([
        { payment: payment('pay-1', 'enr-1'), owner: 'secretary-a', acknowledged: false },
      ]);
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      await waitFor(() => expect(deps.queue.getFailedMutations).toHaveBeenCalledTimes(2));
      await act(async () => undefined);
      // The next account reads none of the first account's lines: not a payment that went.
      setStored([]);
      switchAccount('secretary-b');
      await waitFor(() => expect(deps.table.listForShow).toHaveBeenCalledTimes(3));
      await act(async () => undefined);

      expect(heard).not.toHaveBeenCalled();
      expect(result.current.balanceRefreshing).toBe(false);
    } finally {
      window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, heard);
    }
  });

  it("hides the earlier account's lines at once after an account switch", async () => {
    const { result, setStored, switchAccount, deps } = setup();
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    let release: () => void = () => undefined;
    setStored([]);
    vi.mocked(deps.table.listForShow).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve([]);
        })
    );

    switchAccount('secretary-b');

    // The new account's read is still out: nothing read for the earlier one is shown.
    expect(result.current.lines).toEqual([]);
    await act(async () => release());
    expect(result.current.lines).toEqual([]);
  });
});
