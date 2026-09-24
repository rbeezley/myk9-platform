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
 * Cold offline boot, then signal returns (offline-cold-boot.spec.ts:350).
 *
 * MYK9-601 made the person id durable, so an offline cold boot reads the
 * replica under the CACHED id while the authoritative lookup is still
 * unresolved. When connectivity returns, that lookup confirms the SAME id: the
 * `user::person` identity key does not change, so nothing re-read the entries
 * and My Shows stayed on the offline replica read until a manual reload.
 */
const auth = (personIdentityState: 'unresolved' | 'resolved') => ({
  user: { id: 'user-1', email: 'exhibitor@test.com' },
  userWithRoles: { databaseUserId: 'person-1' },
  personId: 'person-1',
  personIdentityState,
  hasUsablePersonId: true,
  isAuthenticated: true,
});

const renderData = () =>
  renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );

describe('useMyEntriesData — confirming a cached identity re-reads an unconfirmed load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('unresolved'));
  });

  it('re-reads when the identity confirms after an offline replica read', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'replica-offline',
      data: [],
      error: null,
    });
    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getUserEntries).toHaveBeenCalledTimes(1);

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();

    await waitFor(() => expect(getUserEntries).toHaveBeenCalledTimes(2));
    expect(getUserEntries).toHaveBeenLastCalledWith('person-1');
  });

  it('does not re-read when the load it already has was confirmed by the server', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'confirmed',
      data: [],
      error: null,
    });
    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();

    // Give a wrongly-scheduled reload every chance to fire before asserting.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(getUserEntries).toHaveBeenCalledTimes(1);
  });
});
