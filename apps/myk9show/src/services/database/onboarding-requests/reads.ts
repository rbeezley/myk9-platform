// Read-side operations for Onboarding Requests.

import { supabase } from '../supabaseClient';
import { mapDbRow, type DbOnboardingRow, type OnboardingRequest } from './types';

/** Get the current user's existing onboarding requests. */
export async function getMyOnboardingRequests(authUserId: string): Promise<OnboardingRequest[]> {
  const { data, error } = await supabase
    .from('onboarding_requests')
    .select()
    .eq('auth_user_id', authUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as DbOnboardingRow[]).map(mapDbRow);
}

/** Get all onboarding requests (admin only). */
export async function getAllOnboardingRequests(): Promise<OnboardingRequest[]> {
  const { data, error } = await supabase
    .from('onboarding_requests')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as DbOnboardingRow[]).map(mapDbRow);
}
