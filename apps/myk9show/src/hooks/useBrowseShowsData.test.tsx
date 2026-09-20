import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { Show } from '@/types/show-types';
import { UserRole } from '@/types/auth-types';
import { useBrowseShowsData } from './useBrowseShowsData';

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
    });
    useEntryStoreMock.mockReturnValue({
      entries: [],
      isLoading: false,
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

    expect(result.current.entries.some(entry => entry.showId === 'show-1')).toBe(true);
    expect(result.current.accountEntriesReliable).toBe(false);
    expect(result.current.accountEntriesDegraded).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
