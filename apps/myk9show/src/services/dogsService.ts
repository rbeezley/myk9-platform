import { supabase } from '@/lib/supabase';
import type { Dog } from '@/types/dog-types';
import { mockDogs } from '@/mockData/mockDogs';
import { shouldUseMockData } from '@/config/dataSource';
import { logger } from '@/services/LoggingService';

/**
 * Service for managing dog-related data operations.
 * Provides CRUD operations for dogs with support for both mock and Supabase data sources.
 * 
 * @example
 * ```typescript
 * // Get all dogs
 * const dogs = await DogsService.getAll();
 * 
 * // Create a new dog
 * const newDog = await DogsService.create({
 *   name: 'Max',
 *   breed: 'Golden Retriever',
 *   owner: { id: 'owner-123', name: 'John Doe' }
 * });
 * 
 * // Update a dog
 * const updatedDog = await DogsService.update('dog-123', { name: 'Maxwell' });
 * ```
 */
export class DogsService {
  /**
   * Retrieves all dogs from the data source.
   * 
   * @returns Promise that resolves to an array of all dogs, ordered by creation date (newest first)
   * @throws Error if the database operation fails
   * 
   * @example
   * ```typescript
   * try {
   *   const dogs = await DogsService.getAll();
   *   logger.debug(`Found ${dogs.length} dogs`, 'services', {});
   * } catch (error) {
   *   logger.error('Failed to fetch dogs:', 'services', {}, error as Error);
   * }
   * ```
   */
  static async getAll(): Promise<Dog[]> {
    if (shouldUseMockData('USE_MOCK_DOGS')) {
      // Simulate network delay for realistic testing
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockDogs;
    }

    const { data, error } = await supabase
      .from('dog')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch dogs: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data || []) as any[]).map((dog: any) => ({
      id: dog.id,
      name: dog.name,
      breed: dog.breed,
      sex: dog.sex as 'male' | 'female',
      ownerId: dog.owner_id || '',
      callName: dog.call_name || undefined,
      height: dog.height || undefined,
      weight: dog.weight || undefined,
      dateOfBirth: dog.date_of_birth || undefined,
      imageUrl: dog.image_url || undefined,
      spayedNeutered: dog.is_spayed_neutered,
      microchipNumber: dog.microchip_number || undefined,
      color: dog.color || undefined,
      microchip: dog.microchip_number || undefined
    }));
  }

  /**
   * Retrieves a single dog by its unique identifier.
   * 
   * @param id - The unique identifier of the dog to retrieve
   * @returns Promise that resolves to the dog object if found, null if not found
   * @throws Error if the database operation fails
   * 
   * @example
   * ```typescript
   * const dog = await DogsService.getById('dog-123');
   * if (dog) {
   *   logger.debug(`Found dog: ${dog.name}`, 'services', {});
   * } else {
   *   logger.debug('Dog not found', 'services', {});
   * }
   * ```
   */
  static async getById(id: string): Promise<Dog | null> {
    if (shouldUseMockData('USE_MOCK_DOGS')) {
      await new Promise(resolve => setTimeout(resolve, 200));
      return mockDogs.find(dog => dog.id === id) || null;
    }

    const { data, error } = await supabase
      .from('dog')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to fetch dog: ${error.message}`);
    }

    return data ? {
      id: data.id,
      name: data.name,
      breed: data.breed,
      sex: data.sex as 'male' | 'female',
      ownerId: data.owner_id || '',
      callName: data.call_name || undefined,
      height: data.height || undefined,
      weight: data.weight || undefined,
      dateOfBirth: data.date_of_birth || undefined,
      imageUrl: data.image_url || undefined,
      spayedNeutered: data.is_spayed_neutered || undefined,
      microchipNumber: data.microchip_number || undefined,
      color: data.color || undefined,
      microchip: data.microchip_number || undefined
    } : null;
  }

  /**
   * Creates a new dog record in the data source.
   * 
   * @param dog - The dog data to create (excluding ID which is auto-generated)
   * @returns Promise that resolves to the created dog object with assigned ID
   * @throws Error if the database operation fails or validation errors occur
   * 
   * @example
   * ```typescript
   * const newDog = await DogsService.create({
   *   name: 'Buddy',
   *   breed: 'Labrador',
   *   birthDate: new Date('2020-05-15'),
   *   owner: { id: 'owner-456', name: 'Jane Smith' },
   *   registrations: [{
   *     organization: 'AKC',
   *     number: 'AKC123456',
   *     type: 'full'
   *   }]
   * });
   * logger.debug(`Created dog with ID: ${newDog.id}`, 'services', {});
   * ```
   */
  static async create(dog: Omit<Dog, 'id'>): Promise<Dog> {
    if (shouldUseMockData('USE_MOCK_DOGS')) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const newDog: Dog = {
        ...dog,
        id: Date.now().toString(), // Mock ID generation
      };
      return newDog;
    }

    const { data, error } = await supabase
      .from('dog')
      .insert([dog])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create dog: ${error.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      breed: data.breed,
      sex: data.sex as 'male' | 'female',
      ownerId: data.owner_id || '',
      callName: data.call_name || undefined,
      height: data.height || undefined,
      weight: data.weight || undefined,
      dateOfBirth: data.date_of_birth || undefined,
      imageUrl: data.image_url || undefined,
      spayedNeutered: data.is_spayed_neutered || undefined,
      microchipNumber: data.microchip_number || undefined,
      color: data.color || undefined,
      microchip: data.microchip_number || undefined
    };
  }

  /**
   * Updates an existing dog record with new data.
   * 
   * @param id - The unique identifier of the dog to update
   * @param updates - Partial dog object containing the fields to update
   * @returns Promise that resolves to the updated dog object
   * @throws Error if the dog is not found or the database operation fails
   * 
   * @example
   * ```typescript
   * // Update dog's name and add a new title
   * const updatedDog = await DogsService.update('dog-123', {
   *   name: 'Champion Buddy',
   *   titles: ['CGC', 'CD']
   * });
   * 
   * // Update health records
   * await DogsService.update('dog-456', {
   *   healthRecords: {
   *     vaccinations: [{
   *       type: 'DHPP',
   *       date: new Date(),
   *       veterinarian: 'Dr. Smith'
   *     }]
   *   }
   * });
   * ```
   */
  static async update(id: string, updates: Partial<Dog>): Promise<Dog> {
    if (shouldUseMockData('USE_MOCK_DOGS')) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const existingDog = mockDogs.find(dog => dog.id === id);
      if (!existingDog) {
        throw new Error('Dog not found');
      }
      return { ...existingDog, ...updates };
    }

    const { data, error } = await supabase
      .from('dog')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update dog: ${error.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      breed: data.breed,
      sex: data.sex as 'male' | 'female',
      ownerId: data.owner_id || '',
      callName: data.call_name || undefined,
      height: data.height || undefined,
      weight: data.weight || undefined,
      dateOfBirth: data.date_of_birth || undefined,
      imageUrl: data.image_url || undefined,
      spayedNeutered: data.is_spayed_neutered || undefined,
      microchipNumber: data.microchip_number || undefined,
      color: data.color || undefined,
      microchip: data.microchip_number || undefined
    };
  }

  /**
   * Permanently deletes a dog record from the data source.
   * 
   * @param id - The unique identifier of the dog to delete
   * @returns Promise that resolves when the deletion is complete
   * @throws Error if the database operation fails
   * 
   * @warning This operation is irreversible. Consider implementing soft deletion for production use.
   * 
   * @example
   * ```typescript
   * try {
   *   await DogsService.delete('dog-123');
   *   logger.debug('Dog deleted successfully', 'services', {});
   * } catch (error) {
   *   logger.error('Failed to delete dog:', 'services', {}, error as Error);
   * }
   * ```
   */
  static async delete(id: string): Promise<void> {
    if (shouldUseMockData('USE_MOCK_DOGS')) {
      await new Promise(resolve => setTimeout(resolve, 400));
      // In mock mode, we just simulate the deletion
      return;
    }

    const { error } = await supabase
      .from('dog')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete dog: ${error.message}`);
    }
  }

  /**
   * Retrieves all dogs belonging to a specific owner.
   * 
   * @param ownerId - The unique identifier of the owner
   * @returns Promise that resolves to an array of dogs owned by the specified owner
   * @throws Error if the database operation fails
   * 
   * @example
   * ```typescript
   * // Get all dogs for a specific owner
   * const ownerDogs = await DogsService.getByOwnerId('owner-123');
   * logger.debug(`Owner has ${ownerDogs.length} dogs`, 'services', {});
   * 
   * // Display dog names
   * ownerDogs.forEach(dog => {
   *   logger.debug(`- ${dog.name} (${dog.breed})`, 'services', {});
   * });
   * ```
   */
  static async getByOwnerId(ownerId: string): Promise<Dog[]> {
    if (shouldUseMockData('USE_MOCK_DOGS')) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockDogs.filter(dog => dog.owner?.id === ownerId);
    }

    const { data, error } = await supabase
      .from('dog')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch dogs by owner: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((dog: any) => ({
      id: dog.id,
      name: dog.name,
      breed: dog.breed,
      sex: dog.sex as 'male' | 'female',
      ownerId: dog.owner_id || '',
      callName: dog.call_name || undefined,
      height: dog.height || undefined,
      weight: dog.weight || undefined,
      dateOfBirth: dog.date_of_birth || undefined,
      imageUrl: dog.image_url || undefined,
      spayedNeutered: dog.is_spayed_neutered,
      microchipNumber: dog.microchip_number || undefined,
      color: dog.color || undefined,
      microchip: dog.microchip_number || undefined
    } as Dog));
  }
}