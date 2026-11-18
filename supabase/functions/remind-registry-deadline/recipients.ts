import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';

/**
 * The show's NAMED secretary: the people `show_officials` records with role `secretary`, the same
 * source `get_show_officials` (the premium list, the entry forms) reads. Naming happens through
 * `grant_show_official`, which writes `show_officials` and nothing in `user_roles`, so the packet
 * resolver's role lookup would miss this person and reach club admins instead.
 *
 * `show_officials_role_check` allows only secretary, chairman and steward, so there is no trial
 * secretary role to include; a chairman or steward is not who files results and is not mailed.
 *
 * Returns `[]` only for a successful lookup that found no address. A failed query throws, so the
 * run counts it as a failure instead of a show with nobody to tell.
 */
export async function resolveNamedSecretaryEmails(
  supabase: SupabaseClient,
  showId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('show_officials')
    .select('role, people:people!person_id(email, deleted_at)')
    .eq('show_id', showId)
    .eq('role', 'secretary');
  if (error) throw new HttpError(500, 'Failed to look up the show secretary.');

  const byAddress = new Map<string, string>();
  for (const row of (data ?? []) as unknown as {
    people: { email?: string | null; deleted_at?: string | null } | null;
  }[]) {
    // A soft-deleted person keeps their show_officials row; `get_show_officials` skips them too.
    if (row.people?.deleted_at) continue;
    const email = row.people?.email?.trim();
    if (!email || !email.includes('@')) continue;
    if (!byAddress.has(email.toLowerCase())) byAddress.set(email.toLowerCase(), email);
  }
  return [...byAddress.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, email]) => email);
}
