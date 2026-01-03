// Dog Store Detailed Integration Tests
// Tests dog store integration with database layer, focusing on real-world scenarios

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { useDogStore } from '@/store/dogStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useDogWithQuery, useOwnerDogsWithQuery } from '@/hooks/useDogStoreCompat';
import type { DogInput } from '@/store/dogStore';
// import type { Dog } from '@/types/dog-types';

// Mock database queries with realistic responses
const mockDogs = [
  {
    id: 'dog-1',
    name: 'Max',
    breed: 'Golden Retriever',
    sex: 'male',
    date_of_birth: '2020-01-15',
    owner_id: 'user-1',
    color: 'Golden',
    weight: 65,
    height: 24,
    microchip_number: '123456789012345',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z',
    owner: { first_name: 'John', last_name: 'Smith' }
  },
  {
    id: 'dog-2', 
    name: 'Bella',
    breed: 'Border Collie',
    sex: 'female',
    date_of_birth: '2019-06-10',
    owner_id: 'user-2',
    color: 'Black and White',
    weight: 45,
    height: 20,
    microchip_number: '987654321098765',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z',
    owner: { first_name: 'Jane', last_name: 'Doe' }
  },
  {
    id: 'dog-3',
    name: 'Charlie',
    breed: 'Golden Retriever', 
    sex: 'male',
    date_of_birth: '2021-03-20',
    owner_id: 'user-1',
    color: 'Light Golden',
    weight: 70,
    height: 25,
    microchip_number: '111222333444555',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z',
    owner: { first_name: 'John', last_name: 'Smith' }
  }
];

vi.mock('@/services/database/queries/dogQueries', () => ({
  getAllDogs: vi.fn().mockResolvedValue({
    data: mockDogs,
    error: null
  }),
  getDogById: vi.fn((id: string) => {
    const dog = mockDogs.find(d => d.id === id);
    return Promise.resolve({
      data: dog || null,
      error: dog ? null : new Error('Dog not found')
    });
  }),
  getDogsByOwner: vi.fn((ownerId: string) => {
    const dogs = mockDogs.filter(d => d.owner_id === ownerId);
    return Promise.resolve({
      data: dogs,
      error: null
    });
  }),
  createDog: vi.fn((dogData: Record<string, unknown>) => {
    const newDog = {
      id: `dog-${Date.now()}`,
      ...dogData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: newDog,
      error: null
    });
  }),
  updateDog: vi.fn((id: string, updates: Record<string, unknown>) => {
    const dog = mockDogs.find(d => d.id === id);
    if (!dog) {
      return Promise.resolve({
        data: null,
        error: new Error('Dog not found')
      });
    }
    const updatedDog = {
      ...dog,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: updatedDog,
      error: null
    });
  }),
  deleteDog: vi.fn((id: string) => {
    return Promise.resolve({
      data: { id },
      error: null
    });
  }),
  searchDogs: vi.fn((searchTerm: string) => {
    const results = mockDogs.filter(d => 
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.breed.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return Promise.resolve({
      data: results,
      error: null
    });
  }),
  getDogStatistics: vi.fn().mockResolvedValue({
    data: {
      total: mockDogs.length,
      by_breed: {
        'Golden Retriever': 2,
        'Border Collie': 1
      },
      by_sex: {
        'male': 2,
        'female': 1
      },
      average_age: 3.5
    },
    error: null
  })
}));

// Mock other dependencies
vi.mock('@/utils/authHelpers', () => ({
  getLastModifiedBy: vi.fn().mockReturnValue('test-user'),
}));

vi.mock('@/utils/idUtils', () => ({
  generateId: vi.fn(() => `test-id-${Date.now()}-${Math.random()}`),
}));

vi.mock('@/services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })),
}));

vi.mock('@/services/mappers/dogMappers', () => ({
  mapDogInputToInsert: vi.fn((input) => ({
    name: input.name,
    breed: input.breed,
    sex: input.sex,
    date_of_birth: input.birthDate,
    owner_id: input.ownerId,
    color: input.color,
    weight: input.weight,
    height: input.height,
    microchip_number: input.microchipNumber,
  })),
  mapDogInputToUpdate: vi.fn((input) => ({
    name: input.name,
    breed: input.breed,
    color: input.color,
    weight: input.weight,
    height: input.height,
  })),
  mapDatabaseToDog: vi.fn((data) => ({
    id: data.id,
    name: data.name,
    breed: data.breed,
    sex: data.sex,
    birthDate: data.date_of_birth,
    ownerId: data.owner_id,
    ownerName: data.owner ? `${data.owner.first_name} ${data.owner.last_name}` : undefined,
    color: data.color,
    weight: data.weight,
    height: data.height,
    microchipNumber: data.microchip_number,
  })),
  mapDatabaseDogsArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    breed: item.breed,
    sex: item.sex,
    birthDate: item.date_of_birth,
    ownerId: item.owner_id,
    ownerName: item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : undefined,
    color: item.color,
    weight: item.weight,
    height: item.height,
    microchipNumber: item.microchip_number,
  }))),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { 
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Dog Store Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Dog Store UI State Management', () => {
    it('should manage selected dog state correctly', () => {
      const { result } = renderHook(() => useDogStore());

      // Initially no dog selected
      expect(result.current.selectedDogId).toBe('');

      // Select a dog
      act(() => {
        result.current.selectDog('dog-123');
      });

      expect(result.current.selectedDogId).toBe('dog-123');

      // Reset store
      act(() => {
        result.current.resetStore();
      });

      expect(result.current.selectedDogId).toBe('');
    });

    it('should persist UI state to localStorage', () => {
      const { result } = renderHook(() => useDogStore());

      act(() => {
        result.current.selectDog('persistent-dog-id');
      });

      // Simulate page reload
      const { result: result2 } = renderHook(() => useDogStore());
      expect(result2.current.selectedDogId).toBe('persistent-dog-id');
    });

    it('should show deprecation warnings for data operations', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useDogStore());

      // Test deprecated methods
      await expect(result.current.addDog({} as DogInput)).rejects.toThrow();
      await expect(result.current.updateDog('id', {})).rejects.toThrow();
      await expect(result.current.deleteDog('id')).rejects.toThrow();
      
      expect(result.current.getDogById('id')).toBeNull();
      expect(result.current.getDogsByOwner('id')).toEqual([]);
      expect(result.current.getSyncStatus('id')).toBe('synced');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dogStore.addDog is deprecated')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dogStore.updateDog is deprecated')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Dog Store Compatibility Layer', () => {
    it('should load and display dogs correctly', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify dogs are loaded and mapped correctly
      expect(result.current.dogs).toHaveLength(3);
      
      const dog1 = result.current.dogs.find(d => d.id === 'dog-1');
      expect(dog1).toMatchObject({
        id: 'dog-1',
        name: 'Max',
        breed: 'Golden Retriever',
        sex: 'male',
        birthDate: '2020-01-15',
        ownerId: 'user-1',
        ownerName: 'John Smith',
        color: 'Golden',
        weight: 65,
        height: 24,
      });
    });

    it('should handle dog creation with proper mapping', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newDogData: DogInput = {
        name: 'Ruby',
        breed: 'Labrador Retriever',
        birthDate: '2022-08-15',
        sex: 'female',
        color: 'Chocolate',
        weight: 55,
        height: 22,
        ownerId: 'user-3',
        ownerName: 'Alice Johnson',
        microchipNumber: '999888777666555',
      };

      await act(async () => {
        const newDog = await result.current.addDog(newDogData);
        expect(newDog).toMatchObject({
          name: 'Ruby',
          breed: 'Labrador Retriever',
          sex: 'female',
          color: 'Chocolate',
          weight: 55,
          height: 22,
        });
      });

      expect(result.current.isCreating).toBe(false);
    });

    it('should handle dog updates correctly', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updates: Partial<DogInput> = {
        weight: 68,
        color: 'Dark Golden',
      };

      await act(async () => {
        const updatedDog = await result.current.updateDog('dog-1', updates);
        expect(updatedDog).toMatchObject({
          id: 'dog-1',
          name: 'Max',
          weight: 68,
          color: 'Dark Golden',
        });
      });

      expect(result.current.isUpdating).toBe(false);
    });

    it('should handle dog deletion correctly', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // const initialCount = result.current.dogs.length;

      await act(async () => {
        await result.current.deleteDog('dog-2');
      });

      expect(result.current.isDeleting).toBe(false);
      // Note: In real scenario, this would trigger a refetch and show updated list
    });

    it('should provide lookup functions', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Test getDogById
      const dog = result.current.getDogById('dog-1');
      expect(dog).toBeTruthy();
      expect(dog?.name).toBe('Max');

      // Test getDogsByOwner
      const johnsDogs = result.current.getDogsByOwner('user-1');
      expect(johnsDogs).toHaveLength(2);
      expect(johnsDogs.map(d => d.name)).toEqual(['Max', 'Charlie']);

      // Test sync status
      const syncStatus = result.current.getSyncStatus();
      expect(syncStatus).toBe('synced');
    });

    it('should provide statistics', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatistics).toBe(false);
      });

      expect(result.current.statistics).toMatchObject({
        total: 3,
        by_breed: {
          'Golden Retriever': 2,
          'Border Collie': 1
        },
        by_sex: {
          'male': 2,
          'female': 1
        },
        average_age: 3.5
      });
    });

    it('should handle errors gracefully', async () => {
      const wrapper = createWrapper();
      
      // Mock an error
      const { getAllDogs } = await import('@/services/database/queries/dogQueries');
      vi.mocked(getAllDogs).mockRejectedValueOnce({ error: new Error('Database error') });

      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.dogs).toHaveLength(0);
    });
  });

  describe('Individual Dog Query Hook', () => {
    it('should fetch single dog with details', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogWithQuery('dog-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.dog).toMatchObject({
        id: 'dog-1',
        name: 'Max',
        breed: 'Golden Retriever',
        ownerName: 'John Smith',
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle disabled state correctly', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogWithQuery('dog-1', false), { wrapper });

      // Should not load when disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.dog).toBeNull();
    });

    it('should handle non-existent dog', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogWithQuery('non-existent'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.dog).toBeNull();
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('Owner Dogs Query Hook', () => {
    it('should fetch dogs by owner correctly', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useOwnerDogsWithQuery('user-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.dogs).toHaveLength(2);
      expect(result.current.dogs.map(d => d.name)).toEqual(['Max', 'Charlie']);
      expect(result.current.dogs.every(d => d.ownerId === 'user-1')).toBe(true);
    });

    it('should handle owner with no dogs', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useOwnerDogsWithQuery('user-nonexistent'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.dogs).toHaveLength(0);
      expect(result.current.error).toBeNull();
    });

    it('should handle disabled state', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useOwnerDogsWithQuery('user-1', false), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.dogs).toHaveLength(0);
    });
  });

  describe('Real-world Usage Scenarios', () => {
    it('should handle a complete dog registration workflow', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 1. User adds a new dog
      const newDogData: DogInput = {
        name: 'Scout',
        breed: 'Australian Shepherd',
        birthDate: '2023-01-10',
        sex: 'male',
        color: 'Blue Merle',
        weight: 50,
        height: 21,
        ownerId: 'user-4',
        ownerName: 'Mike Wilson',
        microchipNumber: '123123123123123',
        registrations: [
          {
            organization: 'AKC',
            number: 'HP12345678',
            type: 'Full Registration',
            status: 'Active'
          }
        ],
        healthRecords: {
          vaccinations: [
            {
              id: 'vacc-1',
              name: 'DHPP',
              date: '2023-02-15',
              nextDue: '2024-02-15',
              veterinarian: 'Dr. Smith'
            }
          ],
          allergies: [
            {
              id: 'allergy-1',
              allergen: 'Chicken',
              severity: 'Mild',
              reaction: 'Skin irritation',
              notes: 'Avoid chicken-based foods'
            }
          ]
        }
      };

      await act(async () => {
        const newDog = await result.current.addDog(newDogData);
        expect(newDog.name).toBe('Scout');
        expect(newDog.breed).toBe('Australian Shepherd');
      });

      // 2. User realizes they need to update the weight after a vet visit
      await act(async () => {
        const updatedDog = await result.current.updateDog('dog-1', {
          weight: 52,
        });
        expect(updatedDog?.weight).toBe(52);
      });

      // 3. User looks up dogs by owner
      const ownerDogs = result.current.getDogsByOwner('user-1');
      expect(ownerDogs.length).toBeGreaterThan(0);

      // 4. User checks sync status
      const syncStatus = result.current.getSyncStatus();
      expect(['synced', 'pending', 'error']).toContain(syncStatus);
    });

    it('should handle multi-dog household management', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Get all dogs for John Smith (user-1)
      const johnsDogs = result.current.getDogsByOwner('user-1');
      expect(johnsDogs).toHaveLength(2);

      // Verify both dogs belong to the same owner
      expect(johnsDogs.every(dog => dog.ownerId === 'user-1')).toBe(true);
      expect(johnsDogs.every(dog => dog.ownerName === 'John Smith')).toBe(true);

      // Check dog details
      const max = johnsDogs.find(d => d.name === 'Max');
      const charlie = johnsDogs.find(d => d.name === 'Charlie');

      expect(max).toBeTruthy();
      expect(charlie).toBeTruthy();
      expect(max?.breed).toBe('Golden Retriever');
      expect(charlie?.breed).toBe('Golden Retriever');
    });

    it('should handle search and filtering scenarios', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Filter by breed locally
      const goldenRetrievers = result.current.dogs.filter(dog => 
        dog.breed === 'Golden Retriever'
      );
      expect(goldenRetrievers).toHaveLength(2);

      // Filter by sex
      const maleDogs = result.current.dogs.filter(dog => dog.sex === 'male');
      expect(maleDogs).toHaveLength(2);

      // Filter by owner
      const femaleDogsForJane = result.current.dogs.filter(dog => 
        dog.sex === 'female' && dog.ownerName?.includes('Jane')
      );
      expect(femaleDogsForJane).toHaveLength(1);
      expect(femaleDogsForJane[0].name).toBe('Bella');
    });
  });

  describe('Performance and Optimization', () => {
    it('should provide proper loading states for mutations', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially no mutations running
      expect(result.current.isCreating).toBe(false);
      expect(result.current.isUpdating).toBe(false);
      expect(result.current.isDeleting).toBe(false);

      // Test that mutation loading states work
      expect(result.current.isStale).toBeDefined();
      expect(result.current.isFetching).toBeDefined();
    });

    it('should handle concurrent operations correctly', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Simulate concurrent operations
      const operations = Promise.all([
        result.current.addDog({
          name: 'Concurrent Dog 1',
          breed: 'Breed 1',
          sex: 'male',
          ownerId: 'user-1',
          birthDate: '2023-01-01',
        }),
        result.current.addDog({
          name: 'Concurrent Dog 2',
          breed: 'Breed 2',
          sex: 'female',
          ownerId: 'user-2',
          birthDate: '2023-01-02',
        }),
      ]);

      await act(async () => {
        const results = await operations;
        expect(results).toHaveLength(2);
        expect(results[0].name).toBe('Concurrent Dog 1');
        expect(results[1].name).toBe('Concurrent Dog 2');
      });
    });

    it('should provide refetch functionality', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialDogCount = result.current.dogs.length;

      await act(async () => {
        await result.current.refetch();
      });

      // Data should be refetched (count should remain same in this mock scenario)
      expect(result.current.dogs.length).toBe(initialDogCount);
    });
  });
});