import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMyEntriesData } from './useMyEntriesData';
import { getUserEntries, getUserEntriesFromReplica } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

const { listeners } = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
const table = vi.hoisted(() => ({
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: table,
  replicatedDogsTable: table,
  replicatedClassesTable: table,
}));
vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
  getUserEntriesFromReplica: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  LoggingService: { getInstance: () => ({ error: vi.fn(), log: vi.fn(), info: vi.fn() }) },
}));

const row = (checkInStatus: string) => ({
  id: 'entry-1',
  registration_id: 'reg-1',
  show_id: 'show-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  trial_id: 'trial-1',
  handler_id: 'person-1',
  entry_status: 'accepted',
  payment_status: 'paid_online',
  entry_fee: 25,
  check_in_status: checkInStatus,
  is_scored: false,
  submitted_at: '2026-06-01T12:00:00.000Z',
  created_at: '2026-06-01T12:00:00.000Z',
  updated_at: '2026-06-01T12:00:00.000Z',
  dog: { id: 'dog-1', name: 'Koda', call_name: 'Koda' },
  show: { id: 'show-1', name: 'Spring Trial', start_date: '2026-06-15', end_date: '2026-06-16' },
  class: { id: 'class-1', name: 'Novice A', class_number: '101' },
  trial: { id: 'trial-1', trial_type: 'Scent Work' },
  registration: { id: 'reg-1', confirmation_number: 'ABC123' },
});

const notify = () => listeners.forEach(listener => listener());
const checkIn = (result: { current: ReturnType<typeof useMyEntriesData> }) =>
  result.current.entries[0]?.classes[0]?.checkInStatus;

describe('useMyEntriesData — live refresh from the replica (MYK9-1523)', () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'confirmed',
      data: [row('no-status')],
      error: null,
    });
  });

  it('shows a remote check-in from the replica without a second server read, keeping the confirmed source', async () => {
    (getUserEntriesFromReplica as ReturnType<typeof vi.fn>).mockResolvedValue([row('checked-in')]);
    const { result } = renderHook(() =>
      useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(checkIn(result)).not.toBe('checked-in');

    notify();

    await waitFor(() => expect(checkIn(result)).toBe('checked-in'), { timeout: 3000 });
    expect(getUserEntries).toHaveBeenCalledTimes(1);
    expect(result.current.source).toBe('confirmed');
    expect(result.current.isError).toBe(false);
  });

  it('keeps a pending optimistic check-in through a replica notice that lands during a slow read', async () => {
    let finishPersist!: () => void;
    const persist = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishPersist = resolve;
        })
    );
    let finishRead!: (rows: Record<string, unknown>[]) => void;
    (getUserEntriesFromReplica as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(resolve => {
        finishRead = resolve;
      })
    );
    const { result } = renderHook(() => useMyEntriesData({ persistCheckInStatus: persist }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    notify();
    await waitFor(() => expect(getUserEntriesFromReplica).toHaveBeenCalled(), { timeout: 3000 });
    let pendingCheckIn!: Promise<void>;
    act(() => {
      pendingCheckIn = result.current.updateEntryCheckIn('entry-1', 'entry-1', 'checked-in');
    });
    await waitFor(() => expect(checkIn(result)).toBe('checked-in'));

    // The replica holds the pending local write, so the slow read agrees with it.
    await act(async () => {
      finishRead([row('checked-in')]);
    });
    expect(checkIn(result)).toBe('checked-in');
    expect(getUserEntries).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishPersist();
      await pendingCheckIn;
    });
  });
});
