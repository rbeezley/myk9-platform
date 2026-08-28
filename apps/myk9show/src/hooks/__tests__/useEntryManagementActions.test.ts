import { act, renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { setEntryArmband } from '@/services/database/armbands';
import { deleteEntry, updateCheckInStatus } from '@/services/database/entries';
import { updateEnrollmentPaymentStatus } from '@/services/database/show-registrations';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { fromAny } from '@total-typescript/shoehorn';

const mocks = vi.hoisted(() => ({
  setEntryArmband: vi.fn(),
  getEntryArmbandById: vi.fn(),
  getNextArmbandForShow: vi.fn(),
  changeSecretaryEntryStatus: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('@/services/database/armbands', () => ({
  setEntryArmband: mocks.setEntryArmband,
  getEntryArmbandById: mocks.getEntryArmbandById,
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

vi.mock('@/services/database/show-registrations', () => ({
  updateEnrollmentPaymentStatus: vi.fn(),
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

  it('marks matching enrollment entries paid locally when the enrollment payment changes', async () => {
    vi.mocked(updateEnrollmentPaymentStatus).mockResolvedValue({
      data: {
        id: 'registration-1',
        payment_status: 'paid_by_check',
        payment_reference: null,
        paid_amount: 35,
      },
      error: null,
    });
    const entry = { ...makeEntry(), totalFee: 35 };
    const otherEntry = {
      ...makeEntry(),
      id: 'entry-2',
      registrationId: 'registration-2',
      totalFee: 40,
    };
    const setEntries = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [entry, otherEntry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        setError,
        user: { id: 'secretary-1', email: 'secretary@example.test' },
      })
    );

    await act(async () => {
      await result.current.handleEnrollmentPaymentChange(
        'registration-1',
        PaymentStatus.PAID_BY_CHECK,
        'check-100',
        35
      );
    });

    expect(updateEnrollmentPaymentStatus).toHaveBeenCalledWith(
      'registration-1',
      PaymentStatus.PAID_BY_CHECK,
      'check-100',
      35,
      undefined,
      undefined,
      undefined
    );

    const updater = setEntries.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');
    expect(updater([entry, otherEntry])).toEqual([
      {
        ...entry,
        enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
        enrollmentPaymentReference: 'check-100',
        enrollmentPaidAmount: 35,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paidAmount: 35,
      },
      otherEntry,
    ]);
  });

  it('threads checkNumber through to updateEnrollmentPaymentStatus for check payments', async () => {
    vi.mocked(updateEnrollmentPaymentStatus).mockResolvedValue({
      data: {
        id: 'registration-1',
        payment_status: 'paid_by_check',
        payment_reference: null,
        paid_amount: 35,
      },
      error: null,
    });
    const entry = { ...makeEntry(), totalFee: 35 };
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
      await result.current.handleEnrollmentPaymentChange(
        'registration-1',
        PaymentStatus.PAID_BY_CHECK,
        'check-100',
        35,
        undefined,
        undefined,
        '1234'
      );
    });

    expect(updateEnrollmentPaymentStatus).toHaveBeenCalledWith(
      'registration-1',
      PaymentStatus.PAID_BY_CHECK,
      'check-100',
      35,
      undefined,
      undefined,
      '1234'
    );
  });

  it('keeps entry-level refunds when an enrollment payment changes later', async () => {
    vi.mocked(updateEnrollmentPaymentStatus).mockResolvedValue({
      data: {
        id: 'registration-1',
        payment_status: 'paid_by_check',
        payment_reference: null,
        paid_amount: 35,
      },
      error: null,
    });
    const refundedEntry = {
      ...makeEntry(),
      totalFee: 50,
      paymentStatus: PaymentStatus.REFUNDED,
      refundAmount: 20,
      paidAmount: 30,
    };
    const setEntries = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [refundedEntry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        setError,
        user: { id: 'secretary-1', email: 'secretary@example.test' },
      })
    );

    await act(async () => {
      await result.current.handleEnrollmentPaymentChange(
        'registration-1',
        PaymentStatus.PAID_BY_CHECK
      );
    });

    const updater = setEntries.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');
    expect(updater([refundedEntry])).toEqual([
      {
        ...refundedEntry,
        enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
        paymentStatus: PaymentStatus.REFUNDED,
        paidAmount: 30,
      },
    ]);
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
});
