/**
 * Hook to check and manage exhibitor profile status
 * Used to detect if existing users need to complete onboarding
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from './useAuthContext';
import { logger } from '@/services/LoggingService';

export interface ExhibitorProfile {
  id: string;
  person_id: string;
  auth_user_id: string;
  default_handler_id: string | null;
  subscription_tier: 'free' | 'premium';
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
  person?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    profile_image: string | null;
  };
}

export interface CreateExhibitorProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

// Helper to map database result to ExhibitorProfile type
function mapToExhibitorProfile(data: Record<string, unknown>): ExhibitorProfile {
  const personData =
    data.person && typeof data.person === 'object' && !('error' in (data.person as object))
      ? (data.person as ExhibitorProfile['person'])
      : undefined;

  return {
    id: data.id as string,
    person_id: data.person_id as string,
    auth_user_id: data.auth_user_id as string,
    default_handler_id: data.default_handler_id as string | null,
    // DB may still have 'pro' from old data — treat as 'premium'
    subscription_tier:
      (((data.subscription_tier as string) === 'pro'
        ? 'premium'
        : (data.subscription_tier as string)) as 'free' | 'premium') || 'free',
    subscription_expires_at: data.subscription_expires_at as string | null,
    stripe_customer_id: data.stripe_customer_id as string | null,
    onboarding_completed_at: (data.onboarding_completed_at as string | null) ?? null,
    created_at: (data.created_at as string) || new Date().toISOString(),
    updated_at: (data.updated_at as string) || new Date().toISOString(),
    ...(personData !== undefined && { person: personData }),
  };
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
        .select(
          `
          *,
          person:people!person_id(
            id,
            first_name,
            last_name,
            email,
            phone,
            profile_image
          )
        `
        )
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching exhibitor profile', 'useExhibitorProfile', {}, error as Error);
        throw error;
      }

      if (!data) return null;

      return mapToExhibitorProfile(data as Record<string, unknown>);
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
          return mapToExhibitorProfile(existingProfile as Record<string, unknown>);
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
        return mapToExhibitorProfile(newProfile as Record<string, unknown>);
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
        await supabase.from('user_roles').insert({
          user_id: person.id,
          role_id: exhibitorRole.id,
        });
      }

      return mapToExhibitorProfile(profile as Record<string, unknown>);
    },
    onSuccess: () => {
      // Invalidate and refetch profile
      queryClient.invalidateQueries({ queryKey: ['exhibitorProfile', user?.id] });
    },
  });

  // Mark onboarding as complete
  const completeOnboardingMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!user?.id) throw new Error('User not authenticated');
      if (!profile?.id) throw new Error('No exhibitor profile found');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('exhibitor_profiles') as any)
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
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
    onboardingCompleted: !!profile?.onboarding_completed_at,
    // Mutations
    createProfile: createProfileMutation.mutate,
    createProfileAsync: createProfileMutation.mutateAsync,
    isCreatingProfile: createProfileMutation.isPending,
    createProfileError: createProfileMutation.error,
    completeOnboarding: completeOnboardingMutation.mutateAsync,
    isCompletingOnboarding: completeOnboardingMutation.isPending,
  };
}
