import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DogsService } from '@/services/dogsService';
import type { Dog } from '@/types/dog-types';
import { mockDogs } from '@/mockData/mockDogs';

// Mock the supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          data: [],
          error: null
        })),
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: null,
            error: null
          }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: null,
            error: null
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: null
            }))
          }))
        }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          error: null
        }))
      }))
    }))
  }
}));

// Mock the config
vi.mock('@/config/dataSource', () => ({
  shouldUseMockData: vi.fn(() => true) // Default to mock data for tests
}));

// Mock setTimeout to avoid delays in tests
vi.mock('timers', () => ({
  setTimeout: vi.fn((fn) => fn())
}));

describe('DogsService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the mock to use mock data by default
    const { shouldUseMockData } = await import('@/config/dataSource');
    shouldUseMockData.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAll', () => {
    it('should return all dogs from mock data', async () => {
      const dogs = await DogsService.getAll();
      
      expect(dogs).toBeDefined();
      expect(Array.isArray(dogs)).toBe(true);
      expect(dogs.length).toBeGreaterThan(0);
      // Verify it returns the mock data
      expect(dogs).toEqual(mockDogs);
    });

    it('should handle Supabase data source', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      const mockData = [{ id: '1', name: 'Test Dog', breed: 'Test Breed' }];
      supabase.from.mockReturnValue({
        select: () => ({
          order: () => ({
            data: mockData,
            error: null
          })
        })
      });

      const dogs = await DogsService.getAll();
      
      expect(dogs).toEqual(mockData);
      expect(supabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should throw error when Supabase operation fails', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        select: () => ({
          order: () => ({
            data: null,
            error: { message: 'Database error' }
          })
        })
      });

      await expect(DogsService.getAll()).rejects.toThrow('Failed to fetch dogs: Database error');
    });
  });

  describe('getById', () => {
    it('should return dog by ID from mock data', async () => {
      const testDogId = mockDogs[0].id;
      const dog = await DogsService.getById(testDogId);
      
      expect(dog).toBeDefined();
      expect(dog?.id).toBe(testDogId);
      expect(dog).toEqual(mockDogs[0]);
    });

    it('should return null for non-existent dog ID', async () => {
      const dog = await DogsService.getById('non-existent-id');
      
      expect(dog).toBeNull();
    });

    it('should handle Supabase data source', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      const mockDog = { id: '1', name: 'Test Dog', breed: 'Test Breed' };
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: mockDog,
              error: null
            })
          })
        })
      });

      const dog = await DogsService.getById('1');
      
      expect(dog).toEqual(mockDog);
      expect(supabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should return null for PGRST116 error (not found)', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' }
            })
          })
        })
      });

      const dog = await DogsService.getById('non-existent');
      
      expect(dog).toBeNull();
    });

    it('should throw error for other Supabase errors', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: null,
              error: { code: 'OTHER_ERROR', message: 'Database error' }
            })
          })
        })
      });

      await expect(DogsService.getById('1')).rejects.toThrow('Failed to fetch dog: Database error');
    });
  });

  describe('create', () => {
    const newDogData: Omit<Dog, 'id'> = {
      name: 'New Dog',
      breed: 'Test Breed',
      birthDate: new Date('2020-01-01'),
      owner: {
        id: 'owner-1',
        name: 'Test Owner',
        email: 'test@example.com',
        phone: '123-456-7890'
      },
      registrations: [{
        organization: 'AKC',
        number: 'AKC123456',
        type: 'full'
      }],
      gender: 'male',
      color: 'brown'
    };

    it('should create dog with mock data', async () => {
      const dog = await DogsService.create(newDogData);
      
      expect(dog).toBeDefined();
      expect(dog.id).toBeDefined();
      expect(dog.name).toBe(newDogData.name);
      expect(dog.breed).toBe(newDogData.breed);
      expect(dog.owner).toEqual(newDogData.owner);
    });

    it('should handle Supabase data source', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      const mockCreatedDog = { ...newDogData, id: 'created-id' };
      supabase.from.mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () => ({
              data: mockCreatedDog,
              error: null
            })
          })
        })
      });

      const dog = await DogsService.create(newDogData);
      
      expect(dog).toEqual(mockCreatedDog);
      expect(supabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should throw error when Supabase create fails', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () => ({
              data: null,
              error: { message: 'Validation error' }
            })
          })
        })
      });

      await expect(DogsService.create(newDogData)).rejects.toThrow('Failed to create dog: Validation error');
    });
  });

  describe('update', () => {
    const updateData: Partial<Dog> = {
      name: 'Updated Name',
      titles: ['CGC', 'CD']
    };

    it('should update dog with mock data', async () => {
      const testDogId = mockDogs[0].id;
      const dog = await DogsService.update(testDogId, updateData);
      
      expect(dog).toBeDefined();
      expect(dog.id).toBe(testDogId);
      expect(dog.name).toBe(updateData.name);
      expect(dog.titles).toEqual(updateData.titles);
      // Should preserve other fields from original dog
      expect(dog.breed).toBe(mockDogs[0].breed);
    });

    it('should throw error for non-existent dog in mock data', async () => {
      await expect(DogsService.update('non-existent', updateData))
        .rejects.toThrow('Dog not found');
    });

    it('should handle Supabase data source', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      const mockUpdatedDog = { id: '1', ...updateData, breed: 'Original Breed' };
      supabase.from.mockReturnValue({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => ({
                data: mockUpdatedDog,
                error: null
              })
            })
          })
        })
      });

      const dog = await DogsService.update('1', updateData);
      
      expect(dog).toEqual(mockUpdatedDog);
      expect(supabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should throw error when Supabase update fails', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => ({
                data: null,
                error: { message: 'Update failed' }
              })
            })
          })
        })
      });

      await expect(DogsService.update('1', updateData)).rejects.toThrow('Failed to update dog: Update failed');
    });
  });

  describe('delete', () => {
    it('should delete dog with mock data', async () => {
      // Mock data deletion just simulates - no error should be thrown
      await expect(DogsService.delete('any-id')).resolves.toBeUndefined();
    });

    it('should handle Supabase data source', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        delete: () => ({
          eq: () => ({
            error: null
          })
        })
      });

      await expect(DogsService.delete('1')).resolves.toBeUndefined();
      expect(supabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should throw error when Supabase delete fails', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        delete: () => ({
          eq: () => ({
            error: { message: 'Delete failed' }
          })
        })
      });

      await expect(DogsService.delete('1')).rejects.toThrow('Failed to delete dog: Delete failed');
    });
  });

  describe('getByOwnerId', () => {
    it('should return dogs by owner ID from mock data', async () => {
      // Get an owner ID from mock data
      const ownerId = mockDogs[0].owner?.id;
      
      if (ownerId) {
        const dogs = await DogsService.getByOwnerId(ownerId);
        
        expect(Array.isArray(dogs)).toBe(true);
        dogs.forEach(dog => {
          expect(dog.owner?.id).toBe(ownerId);
        });
      }
    });

    it('should return empty array for non-existent owner', async () => {
      const dogs = await DogsService.getByOwnerId('non-existent-owner');
      
      expect(dogs).toEqual([]);
    });

    it('should handle Supabase data source', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      const mockOwnerDogs = [
        { id: '1', name: 'Dog 1', owner_id: 'owner-1' },
        { id: '2', name: 'Dog 2', owner_id: 'owner-1' }
      ];
      
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: mockOwnerDogs,
              error: null
            })
          })
        })
      });

      const dogs = await DogsService.getByOwnerId('owner-1');
      
      expect(dogs).toEqual(mockOwnerDogs);
      expect(supabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should throw error when Supabase getByOwnerId fails', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: null,
              error: { message: 'Query failed' }
            })
          })
        })
      });

      await expect(DogsService.getByOwnerId('owner-1')).rejects.toThrow('Failed to fetch dogs by owner: Query failed');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeout scenarios', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        select: () => ({
          order: () => {
            throw new Error('Network timeout');
          }
        })
      });

      await expect(DogsService.getAll()).rejects.toThrow('Network timeout');
    });

    it('should handle malformed data responses', async () => {
      const { shouldUseMockData } = await import('@/config/dataSource');
      const { supabase } = await import('@/lib/supabase');
      
      shouldUseMockData.mockReturnValue(false);
      
      supabase.from.mockReturnValue({
        select: () => ({
          order: () => ({
            data: undefined, // Malformed response
            error: null
          })
        })
      });

      const dogs = await DogsService.getAll();
      expect(dogs).toEqual([]);
    });
  });

  describe('Data Validation', () => {
    it('should handle creation with minimal required fields', async () => {
      const minimalDog: Omit<Dog, 'id'> = {
        name: 'Minimal Dog',
        breed: 'Unknown',
        owner: {
          id: 'owner-1',
          name: 'Owner Name',
          email: 'owner@example.com'
        }
      };

      const dog = await DogsService.create(minimalDog);
      
      expect(dog.name).toBe(minimalDog.name);
      expect(dog.breed).toBe(minimalDog.breed);
      expect(dog.owner).toEqual(minimalDog.owner);
    });

    it('should handle update with empty update object', async () => {
      const testDogId = mockDogs[0].id;
      const dog = await DogsService.update(testDogId, {});
      
      expect(dog.id).toBe(testDogId);
      // Should return original dog data unchanged
      expect(dog.name).toBe(mockDogs[0].name);
    });
  });
});