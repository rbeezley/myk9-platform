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

function setup(overrides: Partial<Parameters<typeof useMyEntriesDialogs>[0]> = {}) {
  const updateEntryCheckIn = vi.fn(() => Promise.resolve());
  const refreshEntries = vi.fn(() => Promise.resolve());
  const options = { updateEntryCheckIn, refreshEntries, ...overrides };
  const hook = renderHook(() => useMyEntriesDialogs(options));
  return { ...hook, updateEntryCheckIn, refreshEntries };
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

  it('keeps handler identities stable across renders', () => {
    // The card list is memoized on these props. If they changed identity every
    // render, opening one dialog would re-render every card on the page.
    const { result, rerender } = setup();
    const before = result.current;
    rerender();

    expect(result.current.openCheckIn).toBe(before.openCheckIn);
    expect(result.current.openEdit).toBe(before.openEdit);
    expect(result.current.openReceipt).toBe(before.openReceipt);
    expect(result.current.closeCheckIn).toBe(before.closeCheckIn);
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

  it('refreshes before closing the edit dialog, so the card shows the saved values', async () => {
    const order: string[] = [];
    const refreshEntries = vi.fn(() => {
      order.push('refresh');
      return Promise.resolve();
    });
    const { result } = setup({ refreshEntries });

    act(() => result.current.openEdit(ENTRY));
    await act(() => result.current.entryUpdated());

    expect(order).toEqual(['refresh']);
    expect(result.current.editDialog).toEqual({ open: false, entry: null });
  });
});
