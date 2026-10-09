import { supabase, createDatabaseError } from '@/services/database/supabaseClient';

export interface FillEntryOwnerAddressInput {
  showId: string;
  dogId: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface OwnerAddressParts {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

interface FillRow {
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

/**
 * MYK9-1010 (Codex P1): staff taking an entry fill the BLANK parts of the dog
 * owner's address through `fill_entry_owner_address`, authorized by
 * `can_manage_show` for this show. The full person editor needs the owner to
 * have a prior entry in a show the caller manages, which a mail-in owner's
 * first entry never has. The server never overwrites a stored part.
 *
 * Online-only, like every person write: the entry it unblocks is submitted
 * online too.
 */
export async function fillEntryOwnerAddress(
  input: FillEntryOwnerAddressInput
): Promise<OwnerAddressParts> {
  const { data, error } = await supabase.rpc(
    'fill_entry_owner_address' as never,
    {
      p_show_id: input.showId,
      p_dog_id: input.dogId,
      p_street_address: input.streetAddress,
      p_city: input.city,
      p_state: input.state,
      p_zip_code: input.zipCode,
    } as never
  );
  if (error) throw createDatabaseError(error, 'people', 'rpc_fill_entry_owner_address');
  const row = (Array.isArray(data) ? data[0] : data) as FillRow | null | undefined;
  return {
    streetAddress: row?.street_address ?? null,
    city: row?.city ?? null,
    state: row?.state ?? null,
    zipCode: row?.zip_code ?? null,
  };
}
