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
    /**
     * Founding-member premium grant end. `null` = never granted;
     * `undefined` = the column was omitted from the read (DB missing the
     * founding-member migration — see the column-absent fallback below).
     * Consumers must treat both as "not an early adopter".
     */
    early_adopter_until?: string | null;
  };
}

export interface CreateExhibitorProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

// Postgres "undefined_column" — raised when a selected column is absent from
// the schema (e.g. a DB that has not yet applied the early_adopter_until
// migration). PostgREST surfaces this as an HTTP 400 with this code.
const PG_UNDEFINED_COLUMN = '42703';

// Person columns that always exist. early_adopter_until is appended only when
// the optional founding-member migration is present (see selectProfile below).
const BASE_PERSON_COLUMNS = 'id, first_name, last_name, email, phone, profile_image';

// Build the nested exhibitor_profiles select. When includeEarlyAdopter is
// false we omit the optional early_adopter_until column so a DB missing that
// migration does not 400.
function buildProfileSelect(includeEarlyAdopter: boolean): string {
  const personColumns = includeEarlyAdopter
    ? `${BASE_PERSON_COLUMNS},\n            early_adopter_until`
    : BASE_PERSON_COLUMNS;

  return `
          *,
          person:people!person_id(
            ${personColumns}
          )
        `;
}

function isUndefinedColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === PG_UNDEFINED_COLUMN) return true;
  // Defensive: some transport layers drop the structured code; fall back to
  // matching the column name in the message.
  return /early_adopter_until/.test(error.message ?? '');
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

      const runSelect = (includeEarlyAdopter: boolean) =>
        supabase
          .from('exhibitor_profiles')
          .select(buildProfileSelect(includeEarlyAdopter))
          .eq('auth_user_id', user.id)
          .maybeSingle();

      let { data, error } = await runSelect(true);

      // Fail safe when the founding-member migration (early_adopter_until) is
      // absent: a missing column returns Postgres 42703 / HTTP 400. Instead of
      // throwing — which would null out `profile`, false-trigger the onboarding
      // redirect, and re-fire on every retry (a 400 flood) — retry once without
      // the optional column. The profile then loads with early_adopter_until
      // undefined, which useSubscriptionGate already treats as "not an early
      // adopter" (the safe default).
      if (isUndefinedColumnError(error)) {
        logger.warn(
          'exhibitor profile early_adopter_until column missing; retrying without it',
          'useExhibitorProfile',
          { code: error?.code, message: error?.message }
        );
        ({ data, error } = await runSelect(false));
      }

      if (error) {
        logger.error('Error fetching exhibitor profile', 'useExhibitorProfile', {
          code: error.code,
          message: error.message,
          details: error.details,
        });
        throw error;
      }

      if (!data) return null;

      // The dynamic select string defeats supabase-js column inference (it
      // widens `data` to a parse-error union), so route through `unknown`.
      return mapToExhibitorProfile(data as unknown as Record<string, unknown>);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: false,
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
    onSuccess: createdProfile => {
      queryClient.setQueryData(['exhibitorProfile', user?.id], createdProfile);
    },
  });

  // Mark onboarding as complete
  const completeOnboardingMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!user?.id) throw new Error('User not authenticated');
      if (!profile?.id) throw new Error('No exhibitor profile found');

      const completedAt = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('exhibitor_profiles') as any)
        .update({ onboarding_completed_at: completedAt })
        .eq('id', profile.id);

      if (error) throw error;
      const completedProfile: ExhibitorProfile = {
        ...profile,
        onboarding_completed_at: completedAt,
        updated_at: completedAt,
      };
      queryClient.setQueryData(['exhibitorProfile', user.id], completedProfile);
      return completedAt;
    },
    onSuccess: completedAt => {
      queryClient.setQueryData<ExhibitorProfile | null>(['exhibitorProfile', user?.id], current =>
        current
          ? {
              ...current,
              onboarding_completed_at: completedAt,
              updated_at: completedAt,
            }
          : current
      );
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
