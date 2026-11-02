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
 * MYK9-1539: `/exhibitor/entries` gets the account-agnostic offline document
 * shell, so a signed-out or passcode (anonymous) boot of that shell must not
 * read a previous account's cached entries. The page is behind ProtectedRoute
 * (signed-out goes to sign-in); this pins the data layer behind it: no account
 * identity means no replica read, and the person pairing cache is keyed per
 * user id (personIdentityCache.ts, MYK9-601).
 */
const renderData = () =>
  renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );

describe('useMyEntriesData with no account identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'replica-offline',
      data: [{ id: 'previous-account-entry' }],
      error: null,
    });
  });

  it('reads nothing and shows no entries when signed out', async () => {
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null,
      loading: false,
      personId: null,
      personIdentityState: 'missing',
      isAuthenticated: false,
    });
    const { result } = renderData();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getUserEntries).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
  });

  it('reads nothing for an anonymous ringside passcode session', async () => {
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'anon-1', is_anonymous: true },
      loading: false,
      personId: 'previous-person',
      personIdentityState: 'resolved',
      isAuthenticated: true,
    });
    const { result } = renderData();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getUserEntries).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
  });
});
