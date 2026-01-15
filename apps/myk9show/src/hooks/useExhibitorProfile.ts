/**
 * Hook to check and manage exhibitor profile status
 * Used to detect if existing users need to complete onboarding
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from './useAuthContext';

export interface ExhibitorProfile {
  id: string;
  person_id: string;
  auth_user_id: string;
  default_handler_id: string | null;
  subscription_tier: 'free' | 'premium' | 'pro';
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
  person?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
}

export interface CreateExhibitorProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/**
 * Hook to fetch and manage the current user's exhibitor profile
 */
export function useExhibitorProfile() {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  // Fetch exhibitor profile for current user
  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['exhibitorProfile', user?.id],
    queryFn: async (): Promise<ExhibitorProfile | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('exhibitor_profiles')
        .select(`
          *,
          person:people(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching exhibitor profile:', error);
        throw error;
      }

      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create exhibitor profile for existing users who don't have one
  const createProfileMutation = useMutation({
    mutationFn: async (data: CreateExhibitorProfileData): Promise<ExhibitorProfile> => {
      if (!user?.id) throw new Error('User not authenticated');

      // First, create the person record
      const { data: person, error: personError } = await supabase
        .from('people')
        .insert({
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone || null,
          auth_user_id: user.id,
        })
        .select()
        .single();

      if (personError) {
        // Person might already exist (race condition with trigger)
        // Try to find existing person
        const { data: existingPerson, error: findError } = await supabase
          .from('people')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (findError || !existingPerson) {
          throw personError;
        }

        // Person exists, check if profile exists
        const { data: existingProfile } = await supabase
          .from('exhibitor_profiles')
          .select('*')
          .eq('auth_user_id', user.id)
          .single();

        if (existingProfile) {
          return existingProfile;
        }

        // Create profile for existing person
        const { data: newProfile, error: profileError } = await supabase
          .from('exhibitor_profiles')
          .insert({
            person_id: existingPerson.id,
            auth_user_id: user.id,
          })
          .select()
          .single();

        if (profileError) throw profileError;
        return newProfile;
      }

      // Create exhibitor profile
      const { data: profile, error: profileError } = await supabase
        .from('exhibitor_profiles')
        .insert({
          person_id: person.id,
          auth_user_id: user.id,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      // Assign exhibitor role
      const { data: exhibitorRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'exhibitor')
        .single();

      if (exhibitorRole) {
        await supabase
          .from('user_roles')
          .insert({
            user_id: person.id,
            role_id: exhibitorRole.id,
          });
      }

      return profile;
    },
    onSuccess: () => {
      // Invalidate and refetch profile
      queryClient.invalidateQueries({ queryKey: ['exhibitorProfile', user?.id] });
    },
  });

  return {
    profile,
    isLoading,
    error,
    refetch,
    // Derived state
    needsOnboarding: !isLoading && user && !profile,
    hasProfile: !!profile,
    // Mutations
    createProfile: createProfileMutation.mutate,
    createProfileAsync: createProfileMutation.mutateAsync,
    isCreatingProfile: createProfileMutation.isPending,
    createProfileError: createProfileMutation.error,
  };
}
