import { act, renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { setEntryArmband } from '@/services/database/armbands';
import {
  compEntry,
  deleteEntry,
  uncompEntry,
  updateCheckInStatus,
} from '@/services/database/entries';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { fromAny } from '@total-typescript/shoehorn';

const mocks = vi.hoisted(() => ({
  setEntryArmband: vi.fn(),
  getNextArmbandForShow: vi.fn(),
  changeSecretaryEntryStatus: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('@/services/database/armbands', () => ({
  setEntryArmband: mocks.setEntryArmband,
  getNextArmbandForShow: mocks.getNextArmbandForShow,
}));

vi.mock('@/services/database/entries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/entries')>();
  return {
    ...actual, // real implementations for executeStatusChange, executeBulkStatusChange, executeRemoveEntry
    updateEntryStatus: vi.fn(),
    updateCheckInStatus: vi.fn(),
    bulkUpdateEntryStatus: vi.fn(),
    getEntriesForExport: vi.fn(),
    compEntry: vi.fn(),
    uncompEntry: vi.fn(),
    deleteEntry: vi.fn(),
  };
});

vi.mock('@/services/notifications/ccSecretary', () => ({
  resolveSecretaryCc: vi.fn(),
}));

vi.mock('@/services/secretary/entry-workflow', () => ({
  changeSecretaryEntryStatus: mocks.changeSecretaryEntryStatus,
}));

vi.mock('@/lib/undoToast', () => ({
  showUndoToast: mocks.showUndoToast,
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn(),
}));

vi.mock('@/services/AuditService', () => ({
  auditService: {
    log: vi.fn(),
    logAction: vi.fn(),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

function makeEntry(): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'UAT Secretary Dog',
    ownerName: 'UAT Owner',
    ownerEmail: 'owner@example.test',
    handlerName: 'UAT Handler',
    classes: [],
    totalFee: 10,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-05-08T12:00:00Z'),
    lastUpdated: new Date('2026-05-08T12:00:00Z'),
  };
}

describe('useEntryManagementActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setEntryArmband.mockResolvedValue({
      data: { updated: 1, armband: '89742' },
      error: null,
    });
    vi.mocked(updateReplicatedCheckInStatus).mockResolvedValue('mutation-1');
    mocks.changeSecretaryEntryStatus.mockResolvedValue({});
  });

  /**
   * Audit finding C2. `bulkActionEligibility` says a bulk status change "must
   * never" touch a closed entry, because re-approving a scored one corrupts
   * closed results and the move-up queue. The multi-select toolbar filtered
   * before calling this handler; the registration Actions menu passed every
   * entry in the group. The rule now lives in the handler, so no caller can
   * reopen the hole.
   */
  it('never writes a status change to a closed entry, even when the caller asks it to', async () => {
    const pending = { ...makeEntry(), id: 'pending-1', entryStatus: EntryStatus.PENDING };
    const scored = { ...makeEntry(), id: 'scored-1', entryStatus: EntryStatus.COMPLETED };
    const pulled = { ...makeEntry(), id: 'pulled-1', entryStatus: EntryStatus.SCRATCHED };

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [pending, scored, pulled],
        setEntries: vi.fn(),
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );

    await act(async () => {
      // Exactly what the registration "Accept all" menu used to send.
      await result.current.handleEnrollmentBulkStatusChange(
        ['pending-1', 'scored-1', 'pulled-1'],
        EntryStatus.ACCEPTED
      );
    });

    const written = mocks.changeSecretaryEntryStatus.mock.calls.map(
      call => (call[0] as { entry: EntryManagementEntry }).entry.id
    );
    expect(written).toEqual(['pending-1']);
  });

  it('does nothing at all when no entry in the request is eligible', async () => {
    const scored = { ...makeEntry(), id: 'scored-1', entryStatus: EntryStatus.COMPLETED };

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [scored],
        setEntries: vi.fn(),
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleEnrollmentBulkStatusChange(
        ['scored-1'],
        EntryStatus.ACCEPTED
      );
    });

    expect(outcome).toBe(false);
    expect(mocks.changeSecretaryEntryStatus).not.toHaveBeenCalled();
  });

  it('reports a failed status mutation so the badge can offer retry', async () => {
    mocks.changeSecretaryEntryStatus.mockRejectedValueOnce(new Error('offline write failed'));
    const entry = makeEntry();
    const setEntries = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [entry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.handleStatusChange('entry-1', EntryStatus.ACCEPTED);
    });

    expect(saved).toBe(false);
    expect(mocks.showUndoToast).not.toHaveBeenCalled();
  });

  it('marks an accepted status change as queued when offline while keeping undo on the same seam', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const entry = makeEntry();
    const setEntries = vi.fn();

    try {
      const { result } = renderHook(() =>
        useEntryManagementActions({
          entries: [entry],
          setEntries,
          selectedShowId: 'show-1',
          selectedShow: null,
          setError: vi.fn(),
          user: { id: 'secretary-1' },
        })
      );

      await act(async () => {
        await result.current.handleStatusChange('entry-1', EntryStatus.ACCEPTED);
      });

      expect(mocks.changeSecretaryEntryStatus).toHaveBeenCalled();
      expect(mocks.showUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Queued — will sync when online' })
      );
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
    }
  });

  it('assigns secretary armbands by entry id and requested armband number', async () => {
    const entry = makeEntry();
    const setEntries = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [entry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        setError,
        user: { id: 'secretary-1', email: 'secretary@example.test' },
      })
    );

    act(() => {
      result.current.setArmbandDialog({
        open: true,
        entry,
        value: '89742',
      });
    });

    await act(async () => {
      await result.current.handleAssignArmband();
    });

    expect(setEntryArmband).toHaveBeenCalledWith('entry-1', '89742');
    expect(setError).not.toHaveBeenCalled();

    const updater = setEntries.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');
    expect(updater([entry])).toEqual([
      {
        ...entry,
        armbandNumber: '89742',
        entryNumber: '89742',
      },
    ]);
  });

  it('soft-deletes a removed entry with the secretary user id and removes it from local state', async () => {
    vi.mocked(deleteEntry).mockResolvedValue({ data: null, error: null });
    const entry = makeEntry();
    const setEntries = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [entry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        setError,
        user: { id: 'secretary-1', email: 'secretary@example.test' },
      })
    );

    await act(async () => {
      await result.current.handleRemoveEntry('entry-1');
    });

    expect(deleteEntry).toHaveBeenCalledWith('entry-1', 'secretary-1');
    expect(setError).toHaveBeenCalledWith(null);

    const updater = setEntries.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');
    expect(updater([entry])).toEqual([]);
  });

  it('updates inline class check-in through the replicated check-in writer', async () => {
    vi.mocked(updateCheckInStatus).mockResolvedValue(fromAny({ data: null, error: null }));
    const cls = {
      id: 'class-1',
      name: 'Novice A',
      number: '1',
      fee: 35,
      status: 'entered' as const,
      checkInStatus: 'no-status' as const,
    };
    const entry = {
      ...makeEntry(),
      classes: [cls],
    };
    const setEntries = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [entry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        setError,
        user: { id: 'secretary-1', email: 'secretary@example.test' },
      })
    );

    await act(async () => {
      await result.current.handleCheckInStatusChange(entry, cls, 'checked-in');
    });

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(updateCheckInStatus).not.toHaveBeenCalled();
  });
  /**
   * MYK9-639. A move-up creates the destination money-neutral and leaves every
   * cent on the superseded source. A comp clicked on the destination must land
   * on the source, or the secretary waives a $0 row and the real fee stays
   * collected — the exact shape of the bug this issue is about, moved one hop.
   * This drives the REAL handler, not `moneyRootIdOf`, because the stamp only
   * helps if the handler reads it.
   */
  it('comps the entry that holds the money, not the money-neutral destination clicked', async () => {
    vi.mocked(compEntry).mockResolvedValue(fromAny({ data: null, error: null }));
    const source = {
      ...makeEntry(),
      id: 'source-1',
      totalFee: 35,
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      moneyRootEntryId: 'source-1',
    };
    const destination = {
      ...makeEntry(),
      id: 'destination-1',
      totalFee: 0,
      paymentStatus: PaymentStatus.PENDING,
      moneyRootEntryId: 'source-1',
    };

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [source, destination],
        setEntries: vi.fn(),
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );

    await act(async () => {
      await result.current.handleCompEntry('destination-1', 'Judge error');
    });

    expect(compEntry).toHaveBeenCalledWith({ entryId: 'source-1', reason: 'Judge error' });
  });

  it('removes the comp from the same entry it was applied to', async () => {
    vi.mocked(uncompEntry).mockResolvedValue(fromAny({ data: null, error: null }));
    const destination = {
      ...makeEntry(),
      id: 'destination-1',
      totalFee: 0,
      moneyRootEntryId: 'source-1',
    };

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [destination],
        setEntries: vi.fn(),
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );

    await act(async () => {
      await result.current.handleUncompEntry('destination-1');
    });

    expect(uncompEntry).toHaveBeenCalledWith('source-1');
  });

  // MYK9-774: a failed device read of the show's armbands used to answer [],
  // so "Next armband" suggested the show's starting number, which another dog
  // may already wear. The read throws now; the dialog says so and suggests none.
  it('shows an error in the armband dialog when the next armband cannot be worked out', async () => {
    mocks.getNextArmbandForShow.mockRejectedValue(
      new Error('Could not read armbands on this device')
    );
    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [makeEntry()],
        setEntries: vi.fn(),
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );
    act(() => {
      result.current.setArmbandDialog({ open: true, entry: makeEntry(), value: '' });
    });

    await act(async () => {
      await result.current.handleNextArmband();
    });

    expect(result.current.armbandDialog.value).toBe('');
    expect(result.current.armbandDialog.error).toMatch(/Couldn't work out the next armband/);
  });

  it.each([
    { label: 'drops an earlier suggestion', filledBy: 'next', expected: '' },
    { label: 'keeps a number the secretary typed', filledBy: 'typing', expected: '205' },
  ])('when the next armband cannot be worked out, it $label', async ({ filledBy, expected }) => {
    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [makeEntry()],
        setEntries: vi.fn(),
        selectedShowId: 'show-1',
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      })
    );
    act(() => {
      result.current.setArmbandDialog({ open: true, entry: makeEntry(), value: '' });
    });
    if (filledBy === 'next') {
      mocks.getNextArmbandForShow.mockResolvedValueOnce(105);
      await act(async () => {
        await result.current.handleNextArmband();
      });
      expect(result.current.armbandDialog.value).toBe('105');
    } else {
      act(() => {
        result.current.setArmbandDialog(prev => ({ ...prev, value: '205', autoFilled: false }));
      });
    }

    mocks.getNextArmbandForShow.mockRejectedValueOnce(new Error('device read failed'));
    await act(async () => {
      await result.current.handleNextArmband();
    });

    expect(result.current.armbandDialog.value).toBe(expected);
    expect(result.current.armbandDialog.error).toMatch(/Couldn't work out the next armband/);
  });
});
