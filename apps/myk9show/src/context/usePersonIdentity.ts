import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  clearPersonIdentityCache,
  loadPersonIdentityCache,
  savePersonIdentityCache,
} from './personIdentityCache';
import type { PersonIdentityState } from './authContextTypes';

export interface PersonProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
}

export function usePersonIdentity(userId: string | undefined): {
  userProfile: PersonProfile | null | undefined;
  personId: string | null;
  personIdentityState: PersonIdentityState;
  hasUsablePersonId: boolean;
} {
  const {
    data: userProfile,
    isSuccess: userProfileLookupSucceeded,
    isError: userProfileLookupFailed,
    isPlaceholderData,
  } = useQuery<PersonProfile | null>({
    queryKey: ['userProfile', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, email, status')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (error) {
        logger.warn('Could not fetch user profile', 'context', {
          code: error.code,
          message: error.message,
        });
        throw error;
      }

      return data as PersonProfile | null;
    },
    enabled: !!userId,
    // The app-wide query client keeps previous data while changing keys for
    // fast navigation. A person profile is account-scoped, so that behavior
    // would briefly pair account B with account A's person id.
    placeholderData: () => undefined,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const cachedPersonIdentity = useMemo(
    () => (userId ? loadPersonIdentityCache(userId) : null),
    [userId]
  );
  const authoritativeUserProfile = isPlaceholderData ? undefined : userProfile;
  const authoritativeLookupSucceeded = userProfileLookupSucceeded && !isPlaceholderData;
  const personIdentityState: PersonIdentityState = !userId
    ? 'unresolved'
    : authoritativeLookupSucceeded
      ? authoritativeUserProfile?.id
        ? 'resolved'
        : 'missing'
      : userProfileLookupFailed
        ? 'unresolved'
        : 'unresolved';
  const personId =
    personIdentityState === 'missing'
      ? null
      : (authoritativeUserProfile?.id ?? cachedPersonIdentity?.personId ?? null);

  // Do not clear during pre-session boot: the cached pairing is what makes a
  // cold offline session useful. Clear only after a real account transition.
  const previousAuthedUserIdRef = useRef<string | undefined>(userId);
  useEffect(() => {
    const previousUserId = previousAuthedUserIdRef.current;
    if (previousUserId && previousUserId !== userId) {
      clearPersonIdentityCache(previousUserId);
    }
    previousAuthedUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId || !authoritativeLookupSucceeded) return;
    if (authoritativeUserProfile?.id) {
      savePersonIdentityCache(userId, authoritativeUserProfile.id);
    } else {
      clearPersonIdentityCache(userId);
    }
  }, [userId, authoritativeUserProfile?.id, authoritativeLookupSucceeded]);

  return {
    userProfile: authoritativeUserProfile,
    personId,
    personIdentityState,
    hasUsablePersonId: Boolean(personId),
  };
}
