import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { normalizeJuniorHandlerNumbers } from '@/features/registries/juniorHandlerPolicy';

/**
 * MYK9-664: a person's date of birth and junior handler numbers live in
 * `public.people_private`, not on `people`.
 *
 * Who can do what (enforced in the database, 20260924051700):
 *  - READ  — the person themself and site admins only (RLS). Everyone else,
 *            show managers included, reads zero rows. An absent row therefore
 *            means "none stored OR not yours to see", never "definitely none".
 *  - WRITE — `set_person_private_details()`: the person, a site admin, or a
 *            manager of a show the person is entered in. It returns nothing, so
 *            a manager can set a mail-in junior's date of birth without ever
 *            being able to read it back.
 *  - The junior yes/no a manager needs comes from `entry_handler_junior_flags()`
 *    (see juniorHandlerProfiles.ts), never from the date.
 */
export interface PersonPrivateDetails {
  dateOfBirth: string | null;
  juniorHandlerNumbers: Record<string, string> | undefined;
}

/**
 * The patch `set_person_private_details()` accepts. Only the keys present are
 * touched:
 *  - `date_of_birth`: 'YYYY-MM-DD' sets it, null clears it.
 *  - `junior_handler_numbers`: merged key by key; a blank string removes that
 *    registry's number, an absent key leaves it alone.
 */
export interface PersonPrivatePatch {
  date_of_birth?: string | null;
  junior_handler_numbers?: Record<string, string>;
}

export function hasPersonPrivatePatch(patch: PersonPrivatePatch): boolean {
  return patch.date_of_birth !== undefined || patch.junior_handler_numbers !== undefined;
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

/** Write a person's date of birth / junior handler numbers. Never returns them. */
export async function savePersonPrivateDetails(
  personId: string,
  patch: PersonPrivatePatch
): Promise<void> {
  if (!hasPersonPrivatePatch(patch)) return;
  // A plain record, not the interface: PostgREST's `Json` wants an index signature.
  const details: Record<string, string | null | Record<string, string>> = {
    ...(patch.date_of_birth !== undefined && { date_of_birth: patch.date_of_birth || null }),
    ...(patch.junior_handler_numbers !== undefined && {
      junior_handler_numbers: patch.junior_handler_numbers,
    }),
  };
  const { error } = await supabase.rpc('set_person_private_details', {
    p_person_id: personId,
    p_details: details,
  });
  if (error) throw error;
}
