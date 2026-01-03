import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDogStore } from '@/store/dogStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { resetFactories } from '@/test/utils/factories';
import type { DogInput } from '@/store/dogStore';
import type { Dog } from '@/types/dog-types';
import React from 'react';

// Mock data for testing
const mockDogs: Dog[] = [
  {
    id: 'dog-1',
    name: 'Buddy',
    breed: 'Golden Retriever',
    birthDate: '2020-01-01',
    sex: 'male',
    color: 'Golden',
    weight: 70,
    height: 24,
    ownerId: 'owner-1',
    ownerName: 'John Doe',
    microchipNumber: '123456789',
    imageUrl: '',
    registrations: [],
    healthRecords: {
      vaccinations: [],
      medications: [],
      allergies: [],
      vetVisits: []
    },
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  }
];

// Mock the database hooks
const mockUseDogsQuery = vi.fn();
const mockUseCreateDogMutation = vi.fn();
const mockUseUpdateDogMutation = vi.fn();
const mockUseDeleteDogMutation = vi.fn();
const mockUseDogStatisticsQuery = vi.fn();
const mockUseDogQuery = vi.fn();
const mockUseDogsByOwnerQuery = vi.fn();

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => mockUseDogsQuery(),
  useDogQuery: () => mockUseDogQuery(),
  useDogsByOwnerQuery: () => mockUseDogsByOwnerQuery(),
  useCreateDogMutation: () => mockUseCreateDogMutation(),
  useUpdateDogMutation: () => mockUseUpdateDogMutation(),
  useDeleteDogMutation: () => mockUseDeleteDogMutation(),
  useDogStatisticsQuery: () => mockUseDogStatisticsQuery(),
}));

// Mock the mappers
vi.mock('@/services/mappers/dogMappers', () => ({
  mapDogInputToInsert: vi.fn((input) => ({ ...input, id: `db-${Date.now()}` })),
  mapDogInputToUpdate: vi.fn((input) => ({ ...input })),
  mapDatabaseToDog: vi.fn((dbDog) => ({ ...dbDog })),
  mapDatabaseDogsArray: vi.fn((dbDogs) => dbDogs || []),
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
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('dogStore (with database integration)', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset factories
    resetFactories();
    
    // Setup default mock implementations
    mockUseDogsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      isStale: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    
    mockUseCreateDogMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockDogs[0]),
      isPending: false,
      error: null,
    });
    
    mockUseUpdateDogMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockDogs[0]),
      isPending: false,
      error: null,
    });
    
    mockUseDeleteDogMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      error: null,
    });
    
    mockUseDogStatisticsQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    
    mockUseDogQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    
    mockUseDogsByOwnerQuery.mockReturnValue({
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
      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.dogs).toHaveLength(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Data Operations with Database Integration', () => {
    it('should add a new dog using database', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(mockDogs[0]);
      mockUseCreateDogMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const dogInput: DogInput = {
        name: 'Buddy',
        breed: 'Golden Retriever',
        birthDate: '2020-01-01',
        sex: 'male',
        color: 'Golden',
        weight: 70,
        height: 24,
        ownerId: 'owner-123',
        ownerName: 'John Doe',
        microchipNumber: '123456789',
      };

      await act(async () => {
        await result.current.addDog(dogInput);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining(dogInput));
    });

    it('should update an existing dog using database', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(mockDogs[0]);
      mockUseUpdateDogMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const updateData = { name: 'Updated Buddy' };

      await act(async () => {
        await result.current.updateDog('dog-1', updateData);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'dog-1',
        updates: updateData,
      });
    });

    it('should delete a dog using database', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteDogMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.deleteDog('dog-1');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith('dog-1');
    });

    it('should retrieve dogs from database', () => {
      mockUseDogsQuery.mockReturnValue({
        data: mockDogs,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.dogs).toHaveLength(1);
      expect(result.current.dogs[0].name).toBe('Buddy');
    });

    it('should retrieve a dog by ID', () => {
      mockUseDogsQuery.mockReturnValue({
        data: mockDogs,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const dog = result.current.getDogById('dog-1');
      expect(dog).toBeTruthy();
      expect(dog?.name).toBe('Buddy');
    });

    it('should return null for non-existent dog ID', () => {
      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const dog = result.current.getDogById('non-existent');
      expect(dog).toBeNull();
    });

    it('should retrieve dogs by owner', () => {
      mockUseDogsQuery.mockReturnValue({
        data: mockDogs,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const dogs = result.current.getDogsByOwner('owner-1');
      expect(dogs).toHaveLength(1);
      expect(dogs[0].name).toBe('Buddy');
    });

    it('should return empty array for owner with no dogs', () => {
      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const dogs = result.current.getDogsByOwner('non-existent-owner');
      expect(dogs).toHaveLength(0);
    });
  });

  describe('Loading and Error States', () => {
    it('should reflect loading state', () => {
      mockUseDogsQuery.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.isLoading).toBe(true);
      expect(result.current.getSyncStatus()).toBe('pending');
    });

    it('should reflect error state', () => {
      const mockError = new Error('Database error');
      mockUseDogsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: mockError,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.error).toBe(mockError.message);
      expect(result.current.getSyncStatus()).toBe('error');
    });

    it('should handle mutation loading states', () => {
      mockUseCreateDogMutation.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
        error: null,
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isCreating).toBe(true);
    });
  });

  describe('Legacy Store UI State', () => {
    it('should select a dog by ID', () => {
      const { result } = renderHook(() => useDogStore());
      
      act(() => {
        result.current.selectDog('dog-1');
      });

      expect(result.current.selectedDogId).toBe('dog-1');
    });

    it('should reset store to initial state', () => {
      const { result } = renderHook(() => useDogStore());
      
      // First select a dog
      act(() => {
        result.current.selectDog('dog-1');
      });
      
      expect(result.current.selectedDogId).toBe('dog-1');
      
      // Then reset
      act(() => {
        result.current.resetStore();
      });

      expect(result.current.selectedDogId).toBe('');
    });
  });

  describe('React Query Integration', () => {
    it('should provide React Query specific states', () => {
      mockUseDogsQuery.mockReturnValue({
        data: mockDogs,
        isLoading: false,
        error: null,
        isStale: true,
        isFetching: true,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.isStale).toBe(true);
      expect(result.current.isFetching).toBe(true);
      expect(result.current._usingDatabase).toBe(true);
      expect(result.current._reactQueryIntegrated).toBe(true);
    });

    it('should provide refetch functionality', () => {
      const mockRefetch = vi.fn();
      mockUseDogsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: mockRefetch,
      });

      const { result } = renderHook(() => useDogStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      result.current.refetch();
      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});