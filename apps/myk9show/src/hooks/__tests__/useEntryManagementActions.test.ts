import { act, renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { setEntryArmband } from '@/services/database/armbands';
import { bulkCheckIn, deleteEntry, updateCheckInStatus } from '@/services/database/entries';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

const mocks = vi.hoisted(() => ({
  setEntryArmband: vi.fn(),
  autoAssignArmbands: vi.fn(),
  getEntryArmbandById: vi.fn(),
  getNextArmbandForShow: vi.fn(),
}));

vi.mock('@/services/database/armbands', () => ({
  setEntryArmband: mocks.setEntryArmband,
  autoAssignArmbands: mocks.autoAssignArmbands,
  getEntryArmbandById: mocks.getEntryArmbandById,
  getNextArmbandForShow: mocks.getNextArmbandForShow,
}));

vi.mock('@/services/database/entries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/entries')>();
  return {
    ...actual, // real implementations for executeStatusChange, executeBulkStatusChange, executeRemoveEntry
    updateEntryStatus: vi.fn(),
    updateCheckInStatus: vi.fn(),
    bulkCheckIn: vi.fn(),
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
    mocks.setEntryArmband.mockResolvedValue({ data: { updated: 1, armband: '89742' }, error: null });
    vi.mocked(updateReplicatedCheckInStatus).mockResolvedValue('mutation-1');
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
        loadEntries: vi.fn(),
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
        loadEntries: vi.fn(),
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

  it('bulk checks in selected entries through the replicated check-in writer', async () => {
    vi.mocked(bulkCheckIn).mockResolvedValue({ data: [], error: null });
    const entry = makeEntry();
    const setEntries = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useEntryManagementActions({
        entries: [entry],
        setEntries,
        selectedShowId: 'show-1',
        selectedShow: null,
        loadEntries: vi.fn(),
        setError,
        user: { id: 'secretary-1', email: 'secretary@example.test' },
      })
    );

    await act(async () => {
      await result.current.handleEnrollmentBulkCheckIn(['entry-1', 'entry-2']);
    });

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-2', 'checked-in');
    expect(bulkCheckIn).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('updates inline class check-in through the replicated check-in writer', async () => {
    vi.mocked(updateCheckInStatus).mockResolvedValue({ data: null, error: null });
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
        loadEntries: vi.fn(),
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
