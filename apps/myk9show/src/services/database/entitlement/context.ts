// Own-account entitlement context read.
//
// INTENT/DESIGN CARVE-OUT: this is an auth-adjacent, online-only read (design.md
// Decision 6 — "unified client resolver" reads the sanitized server context
// directly). It deliberately does NOT go through @myk9/replication: entitlement
// state gates Premium writes and must reflect the server's `now()` at read time,
// not a cached/replicated snapshot that could let an expired grant appear active
// offline. Every caller of this module must be prepared for it to be a live
// network call.

import { supabase } from '../supabaseClient';
import type { OwnEntitlementContext } from './types';

/**
 * Fetches the current user's sanitized entitlement context via
 * `get_own_entitlement_context()`.
 *
 * Cast pending type regeneration — see the tracking marker in ./types.ts
 * (regenerate after the staging deploy, task 4.10; getMyOnboardingRequests
 * precedent in services/database/onboarding-requests/reads.ts).
 */
export async function fetchOwnEntitlementContext(): Promise<OwnEntitlementContext> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: 'get_own_entitlement_context'
      ) => Promise<{ data: OwnEntitlementContext[] | null; error: { message: string } | null }>;
    }
  ).rpc('get_own_entitlement_context');

  if (error) {
    throw new Error(`fetchOwnEntitlementContext: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error('fetchOwnEntitlementContext: RPC returned no row');
  }

  return row;
}
