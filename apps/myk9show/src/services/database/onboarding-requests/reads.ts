// Read-side operations for Onboarding Requests.

import { supabase } from '../supabaseClient';
import { mapDbRow, type DbOnboardingRow, type OnboardingRequest } from './types';

// The owner-facing read comes back WITHOUT `notes` — that column is
// admin-only and is deliberately not exposed to the requester. See
// migration 20260722120000_onboarding_notes_owner_isolation.sql.
type DbOwnerOnboardingRow = Omit<DbOnboardingRow, 'notes'>;

/**
 * Get the current user's existing onboarding requests.
 *
 * Reads through the `get_my_onboarding_requests` RPC rather than the table:
 * the owner has no direct SELECT on `onboarding_requests`, so the admin-only
 * `notes` column can never reach the requester. The RPC self-scopes to
 * `auth.uid()`, so no user id is passed.
 */
export async function getMyOnboardingRequests(): Promise<OnboardingRequest[]> {
  // TODO(post-migration-push): drop this cast once migration
  // 20260722120000_onboarding_notes_owner_isolation.sql is pushed and
  // `pnpm supabase:gen-types` is re-run — the generated Database type will
  // then include `get_my_onboarding_requests` and the typed client will
  // accept this call directly.
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: string
      ) => Promise<{ data: DbOwnerOnboardingRow[] | null; error: { message: string } | null }>;
    }
  ).rpc('get_my_onboarding_requests');

  if (error) throw error;
  // The RPC omits `notes`; surface it as null so the shared shape holds.
  return (data ?? []).map(row => mapDbRow({ ...row, notes: null }));
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
