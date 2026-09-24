import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { normalizeJuniorHandlerNumbers } from '@/features/registries/juniorHandlerPolicy';

/**
 * MYK9-664: a person's date of birth and junior handler numbers live in
 * `public.people_private`, not on `people`.
 *
 * Who can do what (enforced in the database, 20260924063300):
 *  - READ  — the person themself and site admins only (RLS). Everyone else,
 *            show managers included, reads zero rows. An absent row therefore
 *            means "none stored OR not yours to see", never "definitely none".
 *  - WRITE — `update_person_details()`, the one person-save RPC, called by
 *            `updateUser` (reads.ts): the person, a site admin, or a manager of
 *            a show the person is entered in. It writes the `people` columns and
 *            these in one transaction and never returns them, so a manager can
 *            set a mail-in junior's date of birth without reading it back.
 *  - The junior yes/no a manager needs comes from `entry_handler_junior_flags()`
 *    (see juniorHandlerProfiles.ts), never from the date.
 */
export interface PersonPrivateDetails {
  dateOfBirth: string | null;
  juniorHandlerNumbers: Record<string, string> | undefined;
}

/**
 * The private half of the patch `update_person_details()` accepts. Only the keys present are
 * touched:
 *  - `date_of_birth`: 'YYYY-MM-DD' sets it, null clears it.
 *  - `junior_handler_numbers`: merged key by key; a blank string removes that
 *    registry's number, an absent key leaves it alone.
 */
export interface PersonPrivatePatch {
  date_of_birth?: string | null;
  junior_handler_numbers?: Record<string, string>;
}

/** The stored values for the rows the caller may read (their own, or all for a site admin). */
export async function loadPersonPrivateDetails(
  personIds: readonly string[]
): Promise<Map<string, PersonPrivateDetails>> {
  const ids = [...new Set(personIds.filter(Boolean))];
  const byPersonId = new Map<string, PersonPrivateDetails>();
  // Batched: the filter travels in the URL (MYK9-272).
  for (const batch of chunk(ids, ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('people_private')
      .select('person_id, date_of_birth, junior_handler_numbers')
      .in('person_id', batch);
    if (error) throw error;
    for (const row of data ?? []) {
      byPersonId.set(row.person_id, {
        dateOfBirth: row.date_of_birth ?? null,
        juniorHandlerNumbers: normalizeJuniorHandlerNumbers(row.junior_handler_numbers),
      });
    }
  }
  return byPersonId;
}
