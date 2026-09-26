import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMyEntriesData } from './useMyEntriesData';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
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

/**
 * MYK9-778: `shows.status` must reach the ORDER the class row reads, through
 * the real `transformEntry` and `groupEntriesByOrder`. The row-level render test
 * sets the flag on a fixture directly, so without this a projection that
 * dropped it on the way would leave "Leave class" offered on a closed-out show.
 */
function row(id: string, showId: string, status: string) {
  return {
    id,
    show_id: showId,
    dog_id: 'dog-1',
    entry_status: 'confirmed',
    payment_status: 'pending',
    entry_fee: 25,
    check_in_status: 'no-status',
    deleted_at: null,
    registration_id: null,
    dog: { id: 'dog-1', name: 'Juni', call_name: 'Juni' },
    show: {
      id: showId,
      name: `Show ${showId}`,
      status,
      deleted_at: null,
      start_date: '2026-11-14',
      end_date: '2026-11-15',
    },
    class: { id: `class-${id}`, name: 'Interior Advanced', class_number: '1' },
  };
}

describe('useMyEntriesData — closed-out show (MYK9-778)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  it('carries shows.status = completed onto the order, and only that status', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'confirmed',
      data: [
        row('e-closed', 'show-closed', 'completed'),
        row('e-live', 'show-live', 'in_progress'),
      ],
      error: null,
    });
    const { result } = renderHook(() =>
      useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
    );

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    const byShow = new Map(result.current.entries.map(e => [e.showId, e]));
    expect(byShow.get('show-closed')?.isShowClosedOut).toBe(true);
    expect(byShow.get('show-live')?.isShowClosedOut).toBe(false);
  });
});
