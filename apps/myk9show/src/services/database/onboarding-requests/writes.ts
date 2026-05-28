// Write-side operations for Onboarding Requests.

import { supabase } from '../supabaseClient';
import type { TablesUpdate } from '@/types/supabase';
import {
  mapDbRow,
  type DbOnboardingRow,
  type OnboardingRequest,
  type CreateOnboardingRequest,
} from './types';

/** Submit a new onboarding request (authenticated user). */
export async function submitOnboardingRequest(
  request: CreateOnboardingRequest
): Promise<OnboardingRequest> {
  const { data, error } = await supabase
    .from('onboarding_requests')
    .insert({
      auth_user_id: request.authUserId,
      club_name: request.clubName,
      organization: request.organization,
      contact_name: request.contactName,
      contact_email: request.contactEmail,
      contact_phone: request.contactPhone ?? null,
      first_show_date: request.firstShowDate ?? null,
      message: request.message ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapDbRow(data as DbOnboardingRow);
}

/** Update request status and/or notes (admin only). */
export async function updateOnboardingRequest(
  requestId: string,
  updates: { status?: OnboardingRequest['status']; notes?: string }
): Promise<void> {
  const dbUpdates: TablesUpdate<'onboarding_requests'> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { error } = await supabase
    .from('onboarding_requests')
    .update(dbUpdates)
    .eq('id', requestId);

  if (error) throw error;
}
