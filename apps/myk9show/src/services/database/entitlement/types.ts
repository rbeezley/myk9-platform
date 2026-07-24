// Types for the subscription entitlement grants system.
//
// Mirrors supabase/migrations/20260724120000_subscription_entitlement_grants.sql:
// the `subscription_entitlement_grants` table plus the
// get_own_entitlement_context / admin_grant_entitlement / admin_revoke_entitlement
// RPCs. Not yet in generated Supabase types (migration unpushed) — see the
// `TODO(types)` markers in context.ts / admin.ts.

/** The only two grant types the server accepts (CHECK constraint on the table). */
export type EntitlementGrantType = 'founding' | 'complimentary';

/**
 * Sanitized grant status as surfaced by get_own_entitlement_context().
 * Derived server-side from starts_at/ends_at/revoked_at/superseded_at —
 * never stored as a column.
 */
export type SanitizedGrantStatus = 'active' | 'scheduled' | 'expired' | 'revoked' | 'superseded';

/**
 * Row shape returned by `get_own_entitlement_context()`. Sanitized: never
 * includes reason, granted_by_person_id, or any other admin-only field.
 * Nullable columns are null when the caller has no paid tier and/or no grant.
 */
export interface OwnEntitlementContext {
  evaluated_at: string;
  paid_tier: string | null;
  paid_expires_at: string | null;
  grant_type: EntitlementGrantType | null;
  grant_status: SanitizedGrantStatus | null;
  grant_starts_at: string | null;
  grant_ends_at: string | null;
  scored_show_count: number;
}

/** Params accepted by `admin_grant_entitlement()`. */
export interface AdminGrantParams {
  personId: string;
  grantType: EntitlementGrantType;
  startsAt: string;
  endsAt: string;
  reason: string;
  /** Defaults to false server-side; pass true to explicitly supersede an overlapping active grant. */
  replaceActive?: boolean;
}

/**
 * Full row shape of `subscription_entitlement_grants`, as read by admins
 * (site-admin-only per RLS — see admin.ts).
 */
export interface AdminGrantHistoryRow {
  id: string;
  person_id: string;
  grant_type: EntitlementGrantType;
  starts_at: string;
  ends_at: string;
  reason: string;
  granted_by_person_id: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by_person_id: string | null;
  revoke_reason: string | null;
  superseded_at: string | null;
  superseded_by_grant_id: string | null;
}
