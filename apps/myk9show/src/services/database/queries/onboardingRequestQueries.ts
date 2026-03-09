import { supabase } from '../supabaseClient';

export interface OnboardingRequest {
  id: string;
  authUserId: string;
  clubName: string;
  organization: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  firstShowDate: string | null;
  message: string | null;
  status: 'pending' | 'contacted' | 'onboarded' | 'declined';
  createdAt: string;
  notes: string | null;
}

export interface CreateOnboardingRequest {
  authUserId: string;
  clubName: string;
  organization: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | undefined;
  firstShowDate?: string | undefined;
  message?: string | undefined;
}

interface DbOnboardingRow {
  id: string;
  auth_user_id: string;
  club_name: string;
  organization: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  first_show_date: string | null;
  message: string | null;
  status: string;
  created_at: string;
  notes: string | null;
}

function mapDbRow(row: DbOnboardingRow): OnboardingRequest {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    clubName: row.club_name,
    organization: row.organization,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    firstShowDate: row.first_show_date,
    message: row.message,
    status: row.status as OnboardingRequest['status'],
    createdAt: row.created_at,
    notes: row.notes,
  };
}

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

/** Update request status and/or notes (admin only). */
export async function updateOnboardingRequest(
  requestId: string,
  updates: { status?: OnboardingRequest['status']; notes?: string }
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { error } = await supabase
    .from('onboarding_requests')
    .update(dbUpdates)
    .eq('id', requestId);

  if (error) throw error;
}
