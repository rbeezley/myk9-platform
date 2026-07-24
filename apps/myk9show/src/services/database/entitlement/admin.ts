// Admin-only entitlement grant writes and history reads.
//
// All three functions here only succeed for site admins:
// - grantEntitlement / revokeEntitlement call SECURITY DEFINER RPCs that
//   RAISE if the caller isn't a site admin (see
//   supabase/migrations/20260724120000_subscription_entitlement_grants.sql).
// - fetchGrantHistory reads `subscription_entitlement_grants` directly; RLS
//   on that table has an admin-only SELECT policy and no policy at all for
//   any other verb/role, so a non-admin caller gets an empty result set
//   (RLS denies read) rather than an error.

import { supabase } from '../supabaseClient';
import type { AdminGrantHistoryRow, AdminGrantParams } from './types';

// Cast pending type regeneration — see the tracking marker in ./types.ts
// (admin_grant_entitlement, admin_revoke_entitlement, and the table are not in
// the generated Database type until the migration is pushed; task 4.10).
type UntypedRpcClient = {
  rpc: (
    fn: 'admin_grant_entitlement' | 'admin_revoke_entitlement',
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Creates a new entitlement grant. Returns the new grant's id.
 *
 * `replaceActive` defaults to false: an overlapping active grant will cause
 * the server to reject the call (`overlapping active grant exists`) unless
 * the caller explicitly opts into superseding it.
 */
export async function grantEntitlement(params: AdminGrantParams): Promise<string> {
  const { data, error } = await (supabase as unknown as UntypedRpcClient).rpc(
    'admin_grant_entitlement',
    {
      p_person_id: params.personId,
      p_grant_type: params.grantType,
      p_starts_at: params.startsAt,
      p_ends_at: params.endsAt,
      p_reason: params.reason,
      p_replace_active: params.replaceActive ?? false,
    }
  );

  if (error) {
    throw new Error(`grantEntitlement: ${error.message}`);
  }

  return data as string;
}

/**
 * Revokes an active/scheduled grant. `reason` is required — the server
 * enforces this too, but we guard client-side first so the UI never round-trips
 * a request it can already tell will fail.
 */
export async function revokeEntitlement(grantId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error('revokeEntitlement: reason is required');
  }

  const { error } = await (supabase as unknown as UntypedRpcClient).rpc(
    'admin_revoke_entitlement',
    {
      p_grant_id: grantId,
      p_reason: reason,
    }
  );

  if (error) {
    throw new Error(`revokeEntitlement: ${error.message}`);
  }
}

/**
 * Reads the full grant history for a person, newest first. Works only for
 * site admins — RLS denies the underlying SELECT for everyone else, so a
 * non-admin caller will silently get `[]`, not an error.
 */
export async function fetchGrantHistory(personId: string): Promise<AdminGrantHistoryRow[]> {
  const { data, error } = await (
    supabase as unknown as {
      from: (table: 'subscription_entitlement_grants') => {
        select: (columns: '*') => {
          eq: (
            column: 'person_id',
            value: string
          ) => {
            order: (
              column: 'created_at',
              opts: { ascending: boolean }
            ) => Promise<{
              data: AdminGrantHistoryRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from('subscription_entitlement_grants')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`fetchGrantHistory: ${error.message}`);
  }

  return data ?? [];
}
