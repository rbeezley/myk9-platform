import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';

/**
 * MYK9-1009: the dog and owner facts the AKC marked catalog (Scent Work
 * Regulations Ch.3 §36) prints that the replicated entry rows do not carry.
 *
 * The replica holds `dogs` but maps the owner as an id with null names, and
 * owner addresses live only on `people`. A show secretary reads every dog and
 * person (`dogs_select` / `people_select`, `can_read_dog_directory()`, MYK9-854),
 * and `authenticated` holds table-wide SELECT on both, so no grant change is
 * needed.
 *
 * ANCILLARY, like `loadEntryHandlerJuniorFlags`: paperwork enrichment, not a
 * core offline flow. A failed batch leaves its dogs out of the result and clears
 * `readComplete`; the catalog then prints those fields blank rather than
 * refusing to print, and never prints a guess.
 */
export interface CatalogOwnerProfile {
  firstName: string | null;
  lastName: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export interface CatalogDogProfile {
  dateOfBirth: string | null;
  owner: CatalogOwnerProfile | null;
}

export interface CatalogDogProfilesResult {
  byDogId: Map<string, CatalogDogProfile>;
  /** False when any batch failed, so a caller can say "not read" rather than "none". */
  readComplete: boolean;
}

const CATALOG_DOG_SELECT =
  'id, date_of_birth, owner:people!dogs_owner_id_fkey(first_name, last_name, street_address, city, state, zip_code)';

type OwnerRow = {
  first_name: string | null;
  last_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

type DogRow = { id: string; date_of_birth: string | null; owner: OwnerRow | OwnerRow[] | null };

function toOwnerProfile(owner: DogRow['owner']): CatalogOwnerProfile | null {
  const row = Array.isArray(owner) ? owner[0] : owner;
  if (!row) return null;
  return {
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    streetAddress: row.street_address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zipCode: row.zip_code ?? null,
  };
}

export async function loadCatalogDogProfiles(
  dogIds: readonly string[]
): Promise<CatalogDogProfilesResult> {
  const byDogId = new Map<string, CatalogDogProfile>();
  let readComplete = true;

  // Batched, not one `.in(...)`: the filter travels in the URL (MYK9-272).
  for (const batch of chunk([...new Set(dogIds)], ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase
        .from('dogs')
        .select(CATALOG_DOG_SELECT)
        .in('id', batch);
      if (error) {
        readComplete = false;
        continue;
      }
      for (const row of (data ?? []) as unknown as DogRow[]) {
        byDogId.set(row.id, {
          dateOfBirth: row.date_of_birth ?? null,
          owner: toOwnerProfile(row.owner),
        });
      }
    } catch {
      // Offline: keep what earlier batches returned and report the read partial.
      readComplete = false;
    }
  }

  return { byDogId, readComplete };
}
