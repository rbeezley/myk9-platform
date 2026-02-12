/**
 * Service for exhibitor profile and dog management
 * Provides operations for authenticated exhibitors to manage their profile and dogs
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

// Types (widened to match actual Supabase DB schema)
export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  profile_image: string | null;
  auth_user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ExhibitorProfile {
  id: string;
  person_id: string;
  auth_user_id: string;
  default_handler_id: string | null;
  subscription_tier: string | null;
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  person?: Person;
}

export interface ExhibitorDog {
  id: string;
  name: string;
  call_name: string | null;
  breed: string;
  sex: string | null;
  date_of_birth: string | null;
  color: string | null;
  height: string | null;
  weight: string | null;
  akc_number: string | null;
  ukc_number: string | null;
  other_registry: string | null;
  other_registry_number: string | null;
  microchip_number: string | null;
  image_url: string | null;
  spayed_neutered: boolean | null;
  deceased: boolean | null;
  owner_id: string | null;
  co_owner_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface UpdatePersonData {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  profile_image?: string | null;
}

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

export interface UpdateDogData extends Partial<CreateDogData> {
  deceased?: boolean;
}

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
