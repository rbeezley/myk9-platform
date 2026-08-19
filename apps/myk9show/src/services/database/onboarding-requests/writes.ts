// Write-side operations for Onboarding Requests.

import { supabase } from '../supabaseClient';
import type { TablesUpdate } from '@/types/supabase';
import {
  mapDbRow,
  type DbOnboardingRow,
  type OnboardingRequest,
  type CreateOnboardingRequest,
} from './types';

/**
 * Submit a new onboarding request (authenticated user).
 *
 * Does not read the row back: the owner has no SELECT on the table (notes
 * isolation, migration 20260722120000), so a `.select()` here would fail RLS.
 * The submit form doesn't use the created row, so this resolves to void.
 */
export async function submitOnboardingRequest(request: CreateOnboardingRequest): Promise<void> {
  const { error } = await supabase.from('onboarding_requests').insert({
    auth_user_id: request.authUserId,
    club_name: request.clubName,
    organization: request.organization,
    contact_name: request.contactName,
    contact_email: request.contactEmail,
    contact_phone: request.contactPhone ?? null,
    first_show_date: request.firstShowDate ?? null,
    message: request.message ?? null,
  });

  if (error) throw error;
}

/** Update request status and/or notes (admin only). */
export async function updateOnboardingRequest(
  requestId: string,
  updates: { status?: OnboardingRequest['status']; notes?: string }
): Promise<OnboardingRequest> {
  const dbUpdates: TablesUpdate<'onboarding_requests'> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { data, error } = await supabase
    .from('onboarding_requests')
    .update(dbUpdates)
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return mapDbRow(data as DbOnboardingRow);
}
