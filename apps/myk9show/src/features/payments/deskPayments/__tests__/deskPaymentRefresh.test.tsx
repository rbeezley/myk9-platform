import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/context/authContextObject';
import type { AuthContextType } from '@/context/authContextTypes';
import type { DeskPaymentDeps } from '../deskPaymentDeps';
import { announceDeskPaymentsRecorded } from '../deskPaymentEvents';
import type { DeskPaymentsTable, StoredDeskPayment } from '../DeskPaymentsTable';
import type { LocalDeskPayment } from '../deskPaymentTypes';
import { useDeskPaymentLines } from '../useDeskPaymentLines';
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

    act(() => announceDeskPaymentsRecorded(['show-1']));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['show-payments', 'show-1'] });
  });

  it("reloads Entry Management's form money for the show on screen only", () => {
    const loadEntries = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useReloadOnDeskPaymentsRecorded('show-1', loadEntries));

    act(() => announceDeskPaymentsRecorded(['show-2']));
    expect(loadEntries).not.toHaveBeenCalled();

    act(() => announceDeskPaymentsRecorded(['show-1']));
    expect(loadEntries).toHaveBeenCalledWith('show-1');
  });
});

describe('useDeskPaymentLines (MYK9-2479)', () => {
  function setup() {
    let stored: StoredDeskPayment[] = [
      { payment: payment('pay-1', 'enr-1'), acknowledged: false },
      { payment: payment('pay-2', 'enr-2'), acknowledged: false },
    ];
    const queued = (rowId: string) => ({ id: `mut-${rowId}`, rowId, retries: 0 });
    const deps = {
      table: {
        listForShow: vi.fn(async () => stored),
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
