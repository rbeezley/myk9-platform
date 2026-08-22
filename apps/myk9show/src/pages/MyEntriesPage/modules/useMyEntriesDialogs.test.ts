/**
 * Unit coverage for the dialog cluster extracted from MyEntriesPage
 * (MYK9-217), and a standing guard on the `INTENT:` constraint that moved with
 * it: a failed check-in must reject out of `submitCheckInStatus`.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

import { useMyEntriesDialogs } from './useMyEntriesDialogs';
import type { EntryClass, MyEntry } from './my-entries-types';

const CHECKED_IN = 'checked-in' as const;

const CLASS_ROW: EntryClass = {
  id: 'class-row-1',
  name: 'Novice Container',
  number: '101',
  fee: 30,
  status: 'entered',
};

const ENTRY: MyEntry = {
  id: 'order-1',
  registrationId: 'reg-1',
  showId: 'show-1',
  showName: 'Autumn Trial',
  showDate: new Date('2026-10-01T12:00:00Z'),
  location: { venue: 'Fairgrounds', city: 'Tulsa', state: 'OK' },
  dogName: 'Cooper',
  dogId: 'dog-1',
  classes: [CLASS_ROW],
  dogs: [],
  totalFee: 30,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-08-01T12:00:00Z'),
  lastUpdated: new Date('2026-08-02T12:00:00Z'),
};

type Options = Parameters<typeof useMyEntriesDialogs>[0];

function setup(overrides: Partial<Options> = {}) {
  const updateEntryCheckIn = vi.fn(() => Promise.resolve());
  const refreshEntries = vi.fn(() => Promise.resolve());
  const options: Options = { updateEntryCheckIn, refreshEntries, ...overrides };
  // Options travel as props so a test can swap a collaborator and prove the
  // hook picked the new one up rather than closing over the first.
  const hook = renderHook(({ opts }: { opts: Options }) => useMyEntriesDialogs(opts), {
    initialProps: { opts: options },
  });
  return { ...hook, options, updateEntryCheckIn, refreshEntries };
}

/** A promise the test releases by hand, to observe the in-flight state. */
function deferred() {
  let release: () => void = () => {};
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

describe('useMyEntriesDialogs', () => {
  it('opens each dialog with the entry that was acted on', () => {
    const { result } = setup();

    act(() => result.current.openCheckIn(ENTRY, CLASS_ROW));
    expect(result.current.checkInDialog).toEqual({
      open: true,
      entry: ENTRY,
      classEntry: CLASS_ROW,
    });

    act(() => result.current.openEdit(ENTRY));
    expect(result.current.editDialog).toEqual({ open: true, entry: ENTRY });

    act(() => result.current.openReceipt(ENTRY));
    expect(result.current.receiptDialog).toEqual({ open: true, entry: ENTRY });

    act(() => result.current.openAddDog());
    expect(result.current.addDogOpen).toBe(true);
  });

  it('keeps every handler identity stable across renders', () => {
    // The card list and the dialog group are memoized on these props. If any
    // changed identity every render, opening one dialog would re-render every
    // card on the page. `submitCheckInStatus` and `entryUpdated` are the two
    // with non-empty deps, so they are the two that could quietly regress —
    // they are asserted here rather than assumed.
    const { result, rerender, options } = setup();
    const before = result.current;
    rerender({ opts: options });

    for (const key of [
      'openCheckIn',
      'openEdit',
      'openReceipt',
      'openAddDog',
      'closeCheckIn',
      'closeEdit',
      'closeReceipt',
      'closeAddDog',
      'submitCheckInStatus',
      'entryUpdated',
    ] as const) {
      expect(result.current[key], key).toBe(before[key]);
    }
  });

  it('closes each dialog it opened', () => {
    const { result } = setup();

    act(() => result.current.openCheckIn(ENTRY, CLASS_ROW));
    act(() => result.current.closeCheckIn());
    expect(result.current.checkInDialog).toEqual({ open: false, entry: null, classEntry: null });

    act(() => result.current.openEdit(ENTRY));
    act(() => result.current.closeEdit());
    expect(result.current.editDialog).toEqual({ open: false, entry: null });

    act(() => result.current.openReceipt(ENTRY));
    act(() => result.current.closeReceipt());
    expect(result.current.receiptDialog).toEqual({ open: false, entry: null });

    act(() => result.current.openAddDog());
    act(() => result.current.closeAddDog());
    expect(result.current.addDogOpen).toBe(false);
  });

  it('closes the check-in dialog only after the write resolves', async () => {
    let release: () => void = () => {};
    const updateEntryCheckIn = vi.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    const { result } = setup({ updateEntryCheckIn });

    act(() => result.current.openCheckIn(ENTRY, CLASS_ROW));
    let settled = false;
    act(() => {
      void result.current.submitCheckInStatus(CHECKED_IN).then(() => {
        settled = true;
      });
    });

    expect(result.current.checkInDialog.open).toBe(true);
    expect(updateEntryCheckIn).toHaveBeenCalledWith(
      'order-1',
      'class-row-1',
      CHECKED_IN,
      undefined
    );

    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.checkInDialog.open).toBe(false));
    expect(settled).toBe(true);
  });

  it('INTENT: lets a failed check-in reject, and leaves the dialog open', async () => {
    // CheckInStatusDialog treats "resolved" as "saved" — it closes itself and
    // only renders its error Alert when this promise rejects. Swallowing the
    // throw made a failed check-in indistinguishable from a successful one:
    // the dialog shut cleanly while the optimistic status reverted, so an
    // exhibitor walked away believing their dog was checked in.
    const boom = new Error('offline');
    const updateEntryCheckIn = vi.fn(() => Promise.reject(boom));
    const { result } = setup({ updateEntryCheckIn });

    act(() => result.current.openCheckIn(ENTRY, CLASS_ROW));
    await expect(result.current.submitCheckInStatus(CHECKED_IN)).rejects.toThrow(
      'offline'
    );
    expect(result.current.checkInDialog.open).toBe(true);
  });

  it('does not write when no entry is staged', async () => {
    const { result, updateEntryCheckIn } = setup();
    await act(() => result.current.submitCheckInStatus(CHECKED_IN));
    expect(updateEntryCheckIn).not.toHaveBeenCalled();
  });

  it('holds the edit dialog open until the refresh resolves', async () => {
    // Ordering, asserted by observing the IN-FLIGHT state rather than by
    // recording call order — a call-order array with one entry in it cannot
    // tell "refresh then close" from "close then refresh". Closing first would
    // drop the exhibitor back onto a card still showing the old values.
    const gate = deferred();
    const refreshEntries = vi.fn(() => gate.promise);
    const { result } = setup({ refreshEntries });

    act(() => result.current.openEdit(ENTRY));
    let settled = false;
    act(() => {
      void result.current.entryUpdated().then(() => {
        settled = true;
      });
    });

    expect(refreshEntries).toHaveBeenCalledTimes(1);
    expect(result.current.editDialog.open).toBe(true);

    await act(async () => {
      gate.release();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.editDialog).toEqual({ open: false, entry: null }));
    expect(settled).toBe(true);
  });

  it('calls the current refresh, not the one it first rendered with', async () => {
    // `entryUpdated` closes over `refreshEntries`. If that dependency were
    // dropped, a remount-free swap of the collaborator would keep calling the
    // stale one — an edit saved after a query-client swap would never refetch.
    const { result, rerender, options, refreshEntries } = setup();
    const nextRefresh = vi.fn(() => Promise.resolve());
    rerender({ opts: { ...options, refreshEntries: nextRefresh } });

    await act(() => result.current.entryUpdated());

    expect(nextRefresh).toHaveBeenCalledTimes(1);
    expect(refreshEntries).not.toHaveBeenCalled();
  });

  it('passes the exhibitor’s notes through to the write', async () => {
    const { result, updateEntryCheckIn } = setup();

    act(() => result.current.openCheckIn(ENTRY, CLASS_ROW));
    await act(() => result.current.submitCheckInStatus(CHECKED_IN, 'running late'));

    expect(updateEntryCheckIn).toHaveBeenCalledWith(
      'order-1',
      'class-row-1',
      CHECKED_IN,
      'running late'
    );
  });
});
