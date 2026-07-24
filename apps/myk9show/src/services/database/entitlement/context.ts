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
 */
export async function fetchOwnEntitlementContext(): Promise<OwnEntitlementContext> {
  const { data, error } = await supabase.rpc('get_own_entitlement_context');

  if (error) {
    throw new Error(`fetchOwnEntitlementContext: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error('fetchOwnEntitlementContext: RPC returned no row');
  }

  // Generated types widen grant_type/grant_status to plain string (and drop
  // the nullability the SQL function can return); narrow to the domain type.
  return row as OwnEntitlementContext;
}
