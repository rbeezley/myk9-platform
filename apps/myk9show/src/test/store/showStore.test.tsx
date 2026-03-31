import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useShowStore } from '@/store/showStore';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import { resetFactories } from '@/test/utils/factories';
import type { ShowInput, Show } from '@/types/show-types';
import React from 'react';

// Mock data for testing — matches the actual Show type from @/types/show-types
const mockShows: Show[] = [
  {
    id: 'show-1',
    name: 'Test Dog Show',
    type: 'conformation',
    startDate: '2024-06-15',
    endDate: '2024-06-15',
    location: 'Test Venue',
    address: '123 Test St',
    city: 'Test City',
    state: 'CA',
    zipCode: '12345',
    status: 'upcoming',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2024-05-01',
    entryCloseDate: '2024-06-01',
    preEntryFee: '25',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '456 Club St',
    clubEmail: 'club@test.com',
    assignedJudges: [],
    trials: [],
    stats: [],
  },
];

// Mock the database hooks
const mockUseShowsQuery = vi.fn();
const mockUseCreateShowMutation = vi.fn();
const mockUseUpdateShowMutation = vi.fn();
const mockUseDeleteShowMutation = vi.fn();
const mockUseShowStatisticsQuery = vi.fn();
const mockUseShowQuery = vi.fn();
const mockUseShowsByClubQuery = vi.fn();

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: () => mockUseShowsQuery(),
  useShowQuery: () => mockUseShowQuery(),
  useShowsByClubQuery: () => mockUseShowsByClubQuery(),
  useShowsSearchQuery: () => ({ data: [], isLoading: false, error: null }),
  useShowsByStatusQuery: () => ({ data: [], isLoading: false, error: null }),
  useUpcomingShowsQuery: () => ({ data: [], isLoading: false, error: null }),
  useShowsByDateRangeQuery: () => ({ data: [], isLoading: false, error: null }),
  useShowStatisticsQuery: () => mockUseShowStatisticsQuery(),
  useShowsWithEntryCountsQuery: () => ({ data: [], isLoading: false, error: null }),
  useShowManagement: () => ({
    createShow: mockUseCreateShowMutation().mutateAsync,
    updateShow: mockUseUpdateShowMutation().mutateAsync,
    deleteShow: mockUseDeleteShowMutation().mutateAsync,
    isCreating: mockUseCreateShowMutation().isPending,
    isUpdating: mockUseUpdateShowMutation().isPending,
    isDeleting: mockUseDeleteShowMutation().isPending,
  }),
}));

// Mock replicated judge assignments table (used by showStore subscription)
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: {
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

// Mock userStore (used by showStore for judge name resolution)
vi.mock('@/store/userStore', () => ({
  useUserStore: {
    getState: vi.fn().mockReturnValue({ people: [] }),
  },
}));

// Mock the mappers
vi.mock('@/services/mappers/showMappers', () => ({
  mapShowInputToInsert: vi.fn(input => ({ ...input, id: `db-${Date.now()}` })),
  mapShowInputToUpdate: vi.fn(input => ({ ...input })),
  mapDatabaseToShow: vi.fn(dbShow => ({ ...dbShow })),
  mapDatabaseShowsArray: vi.fn(dbShows => dbShows || []),
}));

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('showStore (with database integration)', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset factories
    resetFactories();

    // Setup default mock implementations
    mockUseShowsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      isStale: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    mockUseCreateShowMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockShows[0]),
      isPending: false,
      error: null,
    });

    mockUseUpdateShowMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockShows[0]),
      isPending: false,
      error: null,
    });

    mockUseDeleteShowMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      error: null,
    });

    mockUseShowStatisticsQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    mockUseShowQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    mockUseShowsByClubQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have empty initial state', () => {
      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      expect(result.current.shows).toHaveLength(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Data Operations with Database Integration', () => {
    it('should add a new show with optimistic update', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(mockShows[0]);
      mockUseCreateShowMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      const showInput: ShowInput = {
        name: 'Test Dog Show',
        type: 'conformation',
        startDate: '2024-06-15',
        endDate: '2024-06-15',
        location: 'Test Venue',
        events: [],
        source: 'myK9Show',
        entryOpenDate: '2024-05-01',
        entryCloseDate: '2024-06-01',
        preEntryFee: '25',
        status: 'upcoming',
        clubId: 'club-1',
        clubName: 'Test Club',
        clubAddress: '456 Club St',
        clubEmail: 'club@test.com',
      };

      await act(async () => {
        await result.current.addShow(showInput);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: showInput.name })
      );
    });

    it('should update an existing show', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        ...mockShows[0],
        name: 'Updated Show',
      });
      mockUseUpdateShowMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      const updateData = { name: 'Updated Show' };

      await act(async () => {
        await result.current.updateShow('show-1', updateData);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'show-1',
        updates: updateData,
      });
    });

    it('should delete a show', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteShowMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.deleteShow('show-1');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'show-1' });
    });

    it('should retrieve shows from database', () => {
      mockUseShowsQuery.mockReturnValue({
        data: mockShows,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      expect(result.current.shows).toHaveLength(1);
      expect(result.current.shows[0].name).toBe('Test Dog Show');
    });

    it('should retrieve a show by ID', () => {
      mockUseShowsQuery.mockReturnValue({
        data: mockShows,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      const show = result.current.getShowById('show-1');
      expect(show).toBeTruthy();
      expect(show?.name).toBe('Test Dog Show');
    });

    it('should return null for non-existent show ID', () => {
      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      const show = result.current.getShowById('non-existent');
      expect(show).toBeNull();
    });
  });

  describe('Loading and Error States', () => {
    it('should reflect loading state', () => {
      mockUseShowsQuery.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should reflect error state', () => {
      const mockError = new Error('Database error');
      mockUseShowsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: mockError,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      expect(result.current.error).toBe(mockError.message);
    });

    it('should handle mutation loading states', () => {
      mockUseCreateShowMutation.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
        error: null,
      });

      const { result } = renderHook(() => useShowStoreCompat(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('Legacy Store UI State', () => {
    it('should select a show by ID', () => {
      const { result } = renderHook(() => useShowStore());

      act(() => {
        result.current.selectShow('show-1');
      });

      expect(result.current.selectedShowId).toBe('show-1');
    });
  });
});
