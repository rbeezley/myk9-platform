/**
 * Whether the person editor may offer to change a person's email.
 *
 * The database is the boundary; this only decides whether to offer an edit it
 * would refuse. The rule is stated here next to its database twin so the two
 * can be read side by side:
 *
 *   `people_guard_identity_columns()` + `person_email_lock_facts_unchecked()`
 *   (supabase/migrations/20260923211700_myk9_711_712_status_site_admin_and_signup_grants.sql,
 *   first version 20260923154300_myk9_710_guard_people_identity_columns.sql)
 *   refuses a non-site-admin email change when the person
 *     - has a sign-in account (`auth_user_id` set), or
 *     - holds any `user_roles` row, or
 *     - has a live entry as handler, or as owner or co-owner of an entered dog.
 *   `enforce_sign_in_email_match()` (MYK9-136) additionally refuses ANY
 *   caller, site admins included, who moves a signed-in person's email away
 *   from their sign-in address, so that case is locked for everyone.
 *
 * The facts come from `person_email_lock_facts()`, which reads them through
 * the same internal function the guard uses, and answers only for a person the
 * caller may already update.
 */
import { supabase } from '../supabaseClient';

export interface PersonEmailLockFacts {
  hasSignIn: boolean;
  hasRoles: boolean;
  hasEntries: boolean;
}

export type PersonEmailLock =
  | { locked: false }
  /** Their sign-in address: nobody can change it from the editor (MYK9-136). */
  | { locked: true; reason: 'sign-in' }
  /** Roles or entries: only a site admin may change it (MYK9-710). */
  | { locked: true; reason: 'site-admin-only' };

/**
 * Pure decision. `facts: null` means unknown (create mode, a failed read, or a
 * person the caller cannot update) and reads as editable: the save itself is
 * refused by the database and the editor reports that refusal.
 */
export function decidePersonEmailLock(input: {
  isSiteAdmin: boolean;
  facts: PersonEmailLockFacts | null;
}): PersonEmailLock {
  const { isSiteAdmin, facts } = input;
  if (!facts) return { locked: false };
  if (facts.hasSignIn) return { locked: true, reason: 'sign-in' };
  if (!isSiteAdmin && (facts.hasRoles || facts.hasEntries)) {
    return { locked: true, reason: 'site-admin-only' };
  }
  return { locked: false };
}

/** One small read. Any failure is "unknown" (see `decidePersonEmailLock`). */
export async function fetchPersonEmailLockFacts(
  personId: string
): Promise<PersonEmailLockFacts | null> {
  const { data, error } = await (supabase.rpc as CallableFunction)('person_email_lock_facts', {
    p_person_id: personId,
  });
  if (error || !data || typeof data !== 'object') return null;
  const facts = data as Record<string, unknown>;
  return {
    hasSignIn: facts.has_sign_in === true,
    hasRoles: facts.has_roles === true,
    hasEntries: facts.has_entries === true,
  };
}
