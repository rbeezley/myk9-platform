/**
 * MYK9-136: stop `people.email` drifting away from `auth.users.email`.
 *
 * Nothing keeps the two in sync — verified against the applied database, no
 * trigger on either table touches email — while the admin edit panel let the
 * contact email be rewritten freely. The moment an admin "corrected" a linked
 * person's address, that person keeps signing in with the old one while every
 * screen shows the new one, and the row can no longer be adopted at signup
 * (`handle_new_user()` matches on `LOWER(people.email)`), so a second person
 * is created instead.
 *
 * The app's own surfaces already treat the sign-in address as read-only: the
 * self-service profile and account pages render `authUser.email` disabled with
 * "Email is managed by your authentication account." The admin panel was the
 * one place that disagreed. This guard makes the write layer agree with them.
 *
 * Why comparing against `people.email` is sound: for a linked person the two
 * columns start equal — `handle_new_user()` either inserts `email = NEW.email`
 * or links an existing row on `LOWER(email)` equality — and this guard is what
 * keeps them that way. So `people.email` is a faithful stand-in for the sign-in
 * address, which the browser cannot read directly (nothing exposes
 * `auth.users.email`; `get_admin_user_list` joins that table for
 * `last_sign_in_at` only).
 *
 * FAILS CLOSED, for the same reason `admin-invite-user` does (MYK9-134): a
 * lookup that errors must not read as "no linked account". Treating a
 * transient blip as "unlinked" would wave through the exact edit this guard
 * exists to prevent.
 */
import { supabase } from '../supabaseClient';
import { normalizePersonEmail } from '@/utils/personIdentity';

import {
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_LOCKED_MESSAGE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
} from '@/utils/signInEmailMessages';

export {
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_LOCKED_MESSAGE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
};

/**
 * `unchanged` — the write cannot create drift whatever the person's identity
 * state is, so it needs no further protection.
 *
 * `no-identity` — the person had no auth identity a moment ago AND the address
 * is genuinely changing. Only this case needs the write itself to re-check the
 * linkage; see `updateUser`.
 */
export type SignInEmailChangeDecision =
  | { allowed: true; reason: 'unchanged' | 'no-identity' }
  | { allowed: false; code: string; message: string };

export interface PersonIdentitySnapshot {
  authUserId: string | null | undefined;
  currentEmail: string | null | undefined;
}

/**
 * Pure decision: may `nextEmail` be written to this person's `email` column?
 *
 * The unchanged case is checked FIRST, and not only as an optimisation.
 * `useUpdatePerson` builds `email` from `person.email` and `useProfileForm`
 * spreads the whole person, so `email` is present on nearly every save;
 * refusing whenever the field appears would break every ordinary profile save
 * by a signed-up user. Deciding it first is also what lets `no-identity` imply
 * "the address is really changing", which the caller relies on.
 */
export function decideSignInEmailChange(
  person: PersonIdentitySnapshot,
  nextEmail: string | null | undefined
): SignInEmailChangeDecision {
  if (normalizePersonEmail(person.currentEmail) === normalizePersonEmail(nextEmail)) {
    return { allowed: true, reason: 'unchanged' };
  }
  if (!person.authUserId) return { allowed: true, reason: 'no-identity' };

  return {
    allowed: false,
    code: SIGN_IN_EMAIL_LOCKED_CODE,
    message: SIGN_IN_EMAIL_LOCKED_MESSAGE,
  };
}

/**
 * Read a person's identity linkage. Returns null when it cannot be read at
 * all — callers must treat that as "unknown", never as "unlinked".
 */
export async function fetchPersonIdentity(
  personId: string
): Promise<PersonIdentitySnapshot | null> {
  const { data, error } = await supabase
    .from('people')
    .select('auth_user_id, email')
    .eq('id', personId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;

  return { authUserId: data.auth_user_id, currentEmail: data.email };
}

/**
 * Read the person's identity linkage, then decide. Any failure to read it is a
 * refusal, never an approval.
 */
export async function checkSignInEmailChange(
  personId: string,
  nextEmail: string | null | undefined
): Promise<SignInEmailChangeDecision> {
  const person = await fetchPersonIdentity(personId);

  if (!person) {
    return {
      allowed: false,
      code: SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
      message: SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
    };
  }

  return decideSignInEmailChange(person, nextEmail);
}
