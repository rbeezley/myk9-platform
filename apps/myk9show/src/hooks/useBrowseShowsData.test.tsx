import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Show } from '@/types/show-types';
import { UserRole } from '@/types/auth-types';
import { useBrowseShowsData } from './useBrowseShowsData';
import { getPublicShows } from '@/services/database/shows';
import { mapDatabaseShowsArray } from '@/services/mappers/showMappers';

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

const mockUser = {
  id: 'auth-user-1',
  databaseUserId: 'person-1',
  roles: [UserRole.EXHIBITOR],
  permissions: [],
} as never;

const mockShow = {
  id: 'show-1',
  name: 'Spring Agility Trial',
  organization: 'Agility',
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2026-10-02T00:00:00.000Z',
  location: 'Test Location',
  status: 'Upcoming',
  events: ['Agility'],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01T00:00:00.000Z',
  entryCloseDate: '2026-09-30T00:00:00.000Z',
  preEntryFee: '$25',
  dayOfShowFee: '$35',
  clubId: 'club-1',
  clubName: 'Test Club',
  clubAddress: 'Test Address',
  clubEmail: 'club@example.com',
  assignedJudges: [],
  stats: [],
  trials: [],
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
} as Show;

const useAuthContextMock = vi.hoisted(() => vi.fn());
const useAccountEnteredShowIdsMock = vi.hoisted(() => vi.fn());
const useEntryStoreMock = vi.hoisted(() => vi.fn());
const useShowStoreMock = vi.hoisted(() => vi.fn());
const useReplicationSyncMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: useAuthContextMock }));
vi.mock('@/hooks/queries/useAccountEnteredShowIds', () => ({
  useAccountEnteredShowIds: useAccountEnteredShowIdsMock,
}));
vi.mock('@/store/entryStore', () => ({ useEntryStore: useEntryStoreMock }));
vi.mock('@/store/showStore', () => ({ useShowStore: useShowStoreMock }));
vi.mock('@/hooks/useReplicationSync', () => ({ useReplicationSync: useReplicationSyncMock }));
vi.mock('@/services/database/shows', () => ({ getPublicShows: vi.fn() }));
vi.mock('@/services/mappers/showMappers', () => ({ mapDatabaseShowsArray: vi.fn() }));
vi.mock('@/services/LoggingService', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('@/utils/show-actions', () => ({ getTabQuickActions: vi.fn(() => []) }));
vi.mock('@/utils/show-relationships', () => ({
  showRelationshipCache: { clearUserCache: vi.fn() },
}));
vi.mock('@/utils/show-management-tracking', () => ({
  showManagementTracker: { clearUserCache: vi.fn() },
  syncShowRelationships: vi.fn(),
  getEnhancedShowContext: vi.fn(() => undefined),
  RelationshipPerformanceMonitor: {
    getInstance: vi.fn(() => ({ recordOperation: vi.fn(), getMetrics: vi.fn(() => ({})) })),
  },
}));
vi.mock('@/utils/permissionValidation', () => ({
  ShowPermissionValidator: { filterShows: vi.fn((shows: Show[]) => shows) },
}));
vi.mock('@/utils/unified-shows-config', () => ({
  getUserShowContext: vi.fn(() => null),
  enhanceShowsWithRelationships: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useBrowseShowsData — unconfirmed account membership', () => {
  it('keeps known entered shows while exposing degraded membership without page failure', () => {
    const refetchAccountEntries = vi.fn(async () => undefined);
    const loadEntries = vi.fn(async () => undefined);
    useAuthContextMock.mockReturnValue({
      user: mockUser,
      userWithRoles: mockUser,
      loading: false,
      personId: 'person-1',
    });
    useAccountEnteredShowIdsMock.mockReturnValue({
      all: ['show-1'],
      active: ['show-1'],
      isLoading: false,
      isError: false,
      identityState: 'resolved',
      hasUsablePersonId: true,
      readState: 'unconfirmed',
      refetch: refetchAccountEntries,
    });
    useEntryStoreMock.mockReturnValue({
      entries: [],
      isLoading: false,
      error: null,
      loadEntries,
    });
    useShowStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ shows: [mockShow], isLoading: false, error: null })
    );
    useReplicationSyncMock.mockReturnValue({ status: { tablesStatus: { shows: 'synced' } } });

    const { result } = renderHook(
      () => useBrowseShowsData({ filteredShows: [mockShow], selectedTab: 'all' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.entries.some(entry => entry.showId === 'show-1')).toBe(true);
    expect(result.current.accountEntriesReliable).toBe(false);
    expect(result.current.accountEntriesDegraded).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isLoading).toBe(false);

    act(() => {
      void result.current.handleRetry();
    });
    expect(refetchAccountEntries).toHaveBeenCalledTimes(1);
    expect(loadEntries).toHaveBeenCalledTimes(2);
  });

  it('does not stamp account membership from a role/profile fallback', () => {
    const loadEntries = vi.fn(async () => undefined);
    useAuthContextMock.mockReturnValue({
      user: mockUser,
      userWithRoles: mockUser,
      loading: false,
      personId: null,
    });
    useAccountEnteredShowIdsMock.mockReturnValue({
      all: ['show-1'],
      active: ['show-1'],
      isLoading: false,
      isError: false,
      identityState: 'unresolved',
      hasUsablePersonId: false,
      readState: 'identity-unresolved',
      refetch: vi.fn(async () => undefined),
    });
    useEntryStoreMock.mockReturnValue({
      entries: [],
      isLoading: false,
      error: null,
      loadEntries,
    });
    useShowStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ shows: [mockShow], isLoading: false, error: null })
    );
    useReplicationSyncMock.mockReturnValue({ status: { tablesStatus: { shows: 'synced' } } });

    const { result } = renderHook(
      () => useBrowseShowsData({ filteredShows: [mockShow], selectedTab: 'all' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.entries).toEqual([]);
    expect(result.current.accountEntriesReliable).toBe(false);
    // Membership confidence is independent from the public Find Shows list;
    // a preloaded show list remains usable while the person identity is pending.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.browseIdentityState).toBe('pending');
  });

  it('keeps preloaded public shows visible while an authenticated identity is pending', async () => {
    const secretary = {
      id: 'auth-user-secretary',
      databaseUserId: undefined,
      roles: [UserRole.SECRETARY],
    } as never;
    const publicShow = { ...mockShow, id: 'public-show-1' };
    vi.mocked(getPublicShows).mockResolvedValue({ data: [{}], error: null } as never);
    vi.mocked(mapDatabaseShowsArray).mockReturnValue([publicShow]);

    useAuthContextMock.mockReturnValue({
      user: secretary,
      userWithRoles: secretary,
      loading: false,
      personId: null,
      personIdentityState: 'unresolved',
      hasUsablePersonId: false,
    });
    useAccountEnteredShowIdsMock.mockReturnValue({
      all: [],
      active: [],
      isLoading: false,
      isError: false,
      identityState: 'unresolved',
      hasUsablePersonId: false,
      readState: 'identity-unresolved',
      refetch: vi.fn(async () => undefined),
    });
    useEntryStoreMock.mockReturnValue({
      entries: [],
      isLoading: true,
      error: null,
      loadEntries: vi.fn(async () => undefined),
    });
    useShowStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ shows: [], isLoading: false, error: null })
    );
    useReplicationSyncMock.mockReturnValue({ status: { tablesStatus: { shows: 'synced' } } });

    const { result } = renderHook(
      () => useBrowseShowsData({ filteredShows: [publicShow], selectedTab: 'all' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.shows).toEqual([publicShow]));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.browseIdentityState).toBe('pending');
  });

  it('does not block a preloaded show list on pending account membership', () => {
    useAuthContextMock.mockReturnValue({
      user: mockUser,
      userWithRoles: mockUser,
      loading: false,
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
    });
    useAccountEnteredShowIdsMock.mockReturnValue({
      all: [],
      active: [],
      isLoading: true,
      isError: false,
      identityState: 'resolved',
      hasUsablePersonId: true,
      readState: 'read-pending',
      refetch: vi.fn(async () => undefined),
    });
    useEntryStoreMock.mockReturnValue({
      entries: [],
      isLoading: true,
      error: null,
      loadEntries: vi.fn(async () => undefined),
    });
    useShowStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ shows: [mockShow], isLoading: false, error: null })
    );
    useReplicationSyncMock.mockReturnValue({ status: { tablesStatus: { shows: 'synced' } } });

    const { result } = renderHook(
      () => useBrowseShowsData({ filteredShows: [mockShow], selectedTab: 'all' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.accountEntriesReliable).toBe(false);
  });
});
