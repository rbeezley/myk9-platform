import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../../supabaseClient';
import { logger } from '@/services/LoggingService';
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  getDogStatistics,
} from '../dogQueries';
import type { DbDogInsert, DbDogUpdate } from '../../../../types/database-mappings';

// Type for Supabase query mocks
type SupabaseMockQuery = {
  select: vi.Mock;
  insert: vi.Mock;
  update: vi.Mock;
  delete: vi.Mock;
  eq: vi.Mock;
  ilike: vi.Mock;
  limit: vi.Mock;
  single: vi.Mock;
  or: vi.Mock;
};

// Mock the Supabase client
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error) => ({
    message: error?.message || 'Database error',
    code: error?.code,
  })),
}));

describe('Dog Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllDogs', () => {
    it('should fetch all dogs with owner information', async () => {
      const mockDogs = [
        {
          id: '1',
          name: 'Max',
          breed: 'Golden Retriever',
          owner: { id: '1', first_name: 'John', last_name: 'Doe' },
        },
        {
          id: '2',
          name: 'Bella',
          breed: 'Labrador',
          owner: { id: '2', first_name: 'Jane', last_name: 'Smith' },
        },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockDogs,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await getAllDogs();

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('owner:people'));
      expect(mockQuery.order).toHaveBeenCalledWith('name', { ascending: true });
      expect(result).toEqual({ data: mockDogs, error: null });
    });

    it('should handle errors gracefully', async () => {
      const mockError = { message: 'Database connection failed' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toEqual(expect.objectContaining({
        message: 'Database connection failed',
      }));
    });
  });

  describe('getDogById', () => {
    it('should fetch a dog by ID with full details', async () => {
      const mockDog = {
        id: '1',
        name: 'Max',
        breed: 'Golden Retriever',
        owner: { id: '1', first_name: 'John', last_name: 'Doe' },
        registrations: [],
        health_records: [],
        entries: [],
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockDog,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await getDogById('1');

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.eq).toHaveBeenCalledWith('id', '1');
      expect(mockQuery.single).toHaveBeenCalled();
      expect(result).toEqual({ data: mockDog, error: null });
    });
  });

  describe('createDog', () => {
    it('should create a new dog', async () => {
      const newDog: DbDogInsert = {
        name: 'Charlie',
        breed: 'Beagle',
        owner_id: '1',
        sex: 'male',
        date_of_birth: '2020-01-01',
      };

      const mockCreatedDog = {
        id: '3',
        ...newDog,
        owner: { id: '1', first_name: 'John', last_name: 'Doe' },
      };

      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockCreatedDog,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await createDog(newDog);

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.insert).toHaveBeenCalledWith([newDog]);
      expect(result).toEqual({ data: mockCreatedDog, error: null });
    });

    it('should handle validation errors', async () => {
      const invalidDog: DbDogInsert = {
        name: '', // Invalid - empty name
        breed: 'Beagle',
        owner_id: '1',
        sex: 'male',
      };

      const mockError = { 
        message: 'Invalid input',
        code: '23514', // Check constraint violation
      };

      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await createDog(invalidDog);

      expect(result.data).toBeNull();
      expect(result.error).toEqual(expect.objectContaining({
        message: 'Invalid input',
      }));
    });
  });

  describe('updateDog', () => {
    it('should update a dog', async () => {
      const updates: DbDogUpdate = {
        name: 'Max Updated',
        weight: 75,
      };

      const mockUpdatedDog = {
        id: '1',
        name: 'Max Updated',
        weight: 75,
        breed: 'Golden Retriever',
        owner: { id: '1', first_name: 'John', last_name: 'Doe' },
      };

      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockUpdatedDog,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await updateDog('1', updates);

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String),
        })
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('id', '1');
      expect(result).toEqual({ data: mockUpdatedDog, error: null });
    });
  });

  describe('deleteDog', () => {
    it('should delete a dog', async () => {
      const mockDeletedDog = { id: '1', name: 'Max' };

      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockDeletedDog,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await deleteDog('1');

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', '1');
      expect(result).toEqual({ data: mockDeletedDog, error: null });
    });
  });

  describe('searchDogs', () => {
    it('should search dogs by name, breed, or call name', async () => {
      const searchTerm = 'golden';
      const mockResults = [
        { id: '1', name: 'Golden Boy', breed: 'Golden Retriever' },
        { id: '2', name: 'Max', breed: 'Golden Retriever' },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockResults,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await searchDogs(searchTerm);

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.or).toHaveBeenCalledWith(
        expect.stringContaining(`name.ilike.%${searchTerm}%`)
      );
      expect(result).toEqual({ data: mockResults, error: null });
    });
  });

  describe('getDogStatistics', () => {
    it('should get dog count statistics', async () => {
      const mockQuery = {
        select: vi.fn().mockResolvedValue({
          data: null,
          error: null,
          count: 42,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await getDogStatistics();

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
      expect(result).toEqual({
        data: { total: 42 },
        error: null,
      });
    });
  });

  describe('getDogsByOwner', () => {
    it('should fetch dogs by owner ID', async () => {
      const ownerId = '123';
      const mockDogs = [
        { id: '1', name: 'Max', owner_id: ownerId },
        { id: '2', name: 'Bella', owner_id: ownerId },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockDogs,
          error: null,
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as SupabaseMockQuery);

      const result = await getDogsByOwner(ownerId);

      expect(supabase.from).toHaveBeenCalledWith('dogs');
      expect(mockQuery.eq).toHaveBeenCalledWith('owner_id', ownerId);
      expect(mockQuery.order).toHaveBeenCalledWith('name', { ascending: true });
      expect(result).toEqual({ data: mockDogs, error: null });
    });
  });
});