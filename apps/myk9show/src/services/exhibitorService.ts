/**
 * Service for exhibitor profile and dog management
 * Provides operations for authenticated exhibitors to manage their profile and dogs
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import type { Database } from '@/types/supabase';

// Derive types from the generated Supabase schema so they never drift
type Tables = Database['public']['Tables'];

export type Person = Tables['people']['Row'];
export type ExhibitorProfile = Tables['exhibitor_profiles']['Row'] & {
  person?: Person;
};
export type ExhibitorDog = Tables['dogs']['Row'];

export type UpdatePersonData = Tables['people']['Update'];

export interface CreateDogData {
  name: string;
  call_name?: string;
  breed: string;
  sex?: 'male' | 'female';
  date_of_birth?: string;
  color?: string;
  height?: string;
  weight?: string;
  akc_number?: string;
  ukc_number?: string;
  other_registry?: string;
  other_registry_number?: string;
  microchip_number?: string;
  image_url?: string;
  spayed_neutered?: boolean;
}

export type UpdateDogData = Tables['dogs']['Update'];

/**
 * Exhibitor Service
 */
export const exhibitorService = {
  /**
   * Get the current user's exhibitor profile with person data
   */
  async getProfile(authUserId: string): Promise<ExhibitorProfile | null> {
    try {
      const { data, error } = await supabase
        .from('exhibitor_profiles')
        .select(`
          *,
          person:people!person_id(*)
        `)
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching exhibitor profile', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to get exhibitor profile', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Update the person record associated with the exhibitor profile
   */
  async updatePerson(personId: string, updates: UpdatePersonData): Promise<Person> {
    try {
      const { data, error } = await supabase
        .from('people')
        .update(updates)
        .eq('id', personId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating person', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to update person', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Update exhibitor profile settings
   */
  async updateProfile(profileId: string, updates: { default_handler_id?: string | null }): Promise<ExhibitorProfile> {
    try {
      const { data, error } = await supabase
        .from('exhibitor_profiles')
        .update(updates)
        .eq('id', profileId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating exhibitor profile', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to update exhibitor profile', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Get all dogs owned by the exhibitor
   */
  async getDogs(personId: string): Promise<ExhibitorDog[]> {
    try {
      const { data, error } = await supabase
        .from('dogs')
        .select('*')
        .eq('owner_id', personId)
        .eq('deceased', false)
        .order('call_name', { ascending: true });

      if (error) {
        logger.error('Error fetching dogs', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Failed to get dogs', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Get a single dog by ID (verifies ownership)
   */
  async getDog(dogId: string, personId: string): Promise<ExhibitorDog | null> {
    try {
      const { data, error } = await supabase
        .from('dogs')
        .select('*')
        .eq('id', dogId)
        .eq('owner_id', personId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching dog', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to get dog', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Create a new dog for the exhibitor
   */
  async createDog(personId: string, dogData: CreateDogData): Promise<ExhibitorDog> {
    try {
      const { data, error } = await supabase
        .from('dogs')
        .insert({
          ...dogData,
          owner_id: personId,
          spayed_neutered: dogData.spayed_neutered || false,
          deceased: false,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating dog', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to create dog', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Update an existing dog (verifies ownership)
   */
  async updateDog(dogId: string, personId: string, updates: UpdateDogData): Promise<ExhibitorDog> {
    try {
      const { data, error } = await supabase
        .from('dogs')
        .update(updates)
        .eq('id', dogId)
        .eq('owner_id', personId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating dog', 'exhibitorService', {}, error as Error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to update dog', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },

  /**
   * Delete a dog (soft delete by marking as deceased)
   */
  async deleteDog(dogId: string, personId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('dogs')
        .update({ deceased: true, deceased_date: new Date().toISOString().split('T')[0] })
        .eq('id', dogId)
        .eq('owner_id', personId);

      if (error) {
        logger.error('Error deleting dog', 'exhibitorService', {}, error as Error);
        throw error;
      }
    } catch (error) {
      logger.error('Failed to delete dog', 'exhibitorService', {}, error as Error);
      throw error;
    }
  },
};

export default exhibitorService;
