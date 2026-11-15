// Who receives a club's money emails (MYK9-1986).
//
// Every money email to a club goes to each ACTIVE club admin and to the club's
// contact address (`clubs.email`), one message per address. The contact address
// is often a shared inbox; the people who can fix a bank problem are the admins.
//
// "Active" is the same rule `public.is_club_admin` applies: `user_roles.is_active`
// and not past `expires_at`. A club admin granted for one show counts for the
// whole club (MYK9-1886), so `show_id` is not filtered. A holder whose person row
// is deleted or suspended is skipped: they cannot sign in to act on the email.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

/** The `user_roles` -> `people` embed named by the holder's FK (user_roles has two FKs to people). */
const USER_ROLE_HOLDER_EMBED = 'people!user_roles_user_id_fkey';

interface HolderPerson {
  email?: string | null;
  deleted_at?: string | null;
  status?: string | null;
}

export interface ClubAdminRoleRow {
  is_active: boolean | null;
  expires_at: string | null;
  people: HolderPerson | HolderPerson[] | null;
}

function isCurrentRole(row: ClubAdminRoleRow, now: Date): boolean {
  if (row.is_active !== true) return false;
  if (row.expires_at == null) return true;
  const expiresAt = Date.parse(row.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function holderOf(row: ClubAdminRoleRow): HolderPerson | null {
  return (Array.isArray(row.people) ? row.people[0] : row.people) ?? null;
}

/**
 * The deduplicated address list: active admins first, then the contact address.
 * Addresses compare case-insensitively and trimmed; the first spelling seen is kept.
 */
export function resolveClubMoneyRecipients(
  contactEmail: string | null | undefined,
  adminRows: readonly ClubAdminRoleRow[],
  now: Date = new Date()
): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  const add = (raw: string | null | undefined) => {
    const address = raw?.trim();
    if (!address || !address.includes('@')) return;
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push(address);
  };

  for (const row of adminRows) {
    if (!isCurrentRole(row, now)) continue;
    const person = holderOf(row);
    if (!person || person.deleted_at || person.status === 'suspended') continue;
    add(person.email);
  }
  add(contactEmail);
  return recipients;
}

/**
 * Load the club's admins and merge them with its contact address.
 *
 * Never throws: an admin lookup failure falls back to the contact address alone,
 * which is what the club received before this change, so a money email is never
 * lost to a recipient query.
 */
export async function loadClubMoneyRecipients(
  supabase: SupabaseClient,
  clubId: string,
  contactEmail: string | null | undefined
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select(
        `is_active, expires_at, ${USER_ROLE_HOLDER_EMBED}(email, deleted_at, status), roles!inner(name)`
      )
      .eq('club_id', clubId)
      .eq('roles.name', 'club_admin');
    if (error) {
      console.error(`Club admin lookup failed for club ${clubId}:`, error);
      return resolveClubMoneyRecipients(contactEmail, []);
    }
    return resolveClubMoneyRecipients(contactEmail, (data ?? []) as unknown as ClubAdminRoleRow[]);
  } catch (err) {
    console.error(`Club admin lookup threw for club ${clubId}:`, err);
    return resolveClubMoneyRecipients(contactEmail, []);
  }
}
