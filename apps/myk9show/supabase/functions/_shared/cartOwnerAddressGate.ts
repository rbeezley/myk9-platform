/**
 * MYK9-1010: stripe-checkout refuses a cart with an AKC line whose dog's owner
 * has no complete address, BEFORE any Checkout Session is opened.
 *
 * The card path creates its entries only after payment (stripe-webhook ->
 * create_online_paid_entry), and a refusal there would be a charge with no
 * entry (MYK9-963). So the refusal lives here, in front of the money.
 *
 * Mirrors, part for part and label for label, the client's
 * `ownerAddressMissingParts` (src/features/registration/ownerAddress.ts) and
 * `submit_show_entries` (20261008183700_myk9_1010_owner_address_required.sql):
 * street address, city, state and ZIP must each be non-blank after trim; the
 * registry is the trial's, a blank one being AKC; a dog with no owner is
 * refused. A Finish Payment line (entry_id set) is skipped: the dog is already
 * entered, and the catalog flags it (MYK9-1009).
 */

export const OWNER_ADDRESS_REQUIRED_CODE = 'owner_address_required';

export interface OwnerAddressRow {
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

export interface OwnerAddressGateLine {
  dog_id: string;
  entry_id: string | null;
  dog?: { call_name?: string | null; owner?: OwnerAddressRow | null } | null;
  class?: { trial?: { registry_id?: string | null } | null } | null;
}

export interface OwnerAddressRefusal {
  code: typeof OWNER_ADDRESS_REQUIRED_CODE;
  error: string;
  dogs: { dog_id: string; dog_name: string; missing: string[] }[];
}

const PARTS = [
  ['street_address', 'street address'],
  ['city', 'city'],
  ['state', 'state or province'],
  ['zip_code', 'ZIP or postal code'],
] as const;

function missingParts(owner: OwnerAddressRow): string[] {
  return PARTS.filter(([key]) => !owner[key]?.trim()).map(([, label]) => label);
}

function formatPartList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function isAkc(line: OwnerAddressGateLine): boolean {
  return (line.class?.trial?.registry_id?.trim() || 'AKC') === 'AKC';
}

/** The refusal for the first offending dog's sentence, listing every one; null to proceed. */
export function cartOwnerAddressRefusal(
  lines: readonly OwnerAddressGateLine[]
): OwnerAddressRefusal | null {
  const dogs: OwnerAddressRefusal['dogs'] = [];
  const messages: string[] = [];
  for (const line of lines) {
    if (line.entry_id !== null || !isAkc(line)) continue;
    if (dogs.some(dog => dog.dog_id === line.dog_id)) continue;
    const dogName = line.dog?.call_name?.trim() || 'This dog';
    const owner = line.dog?.owner ?? null;
    const missing = owner ? missingParts(owner) : PARTS.map(([, label]) => label);
    if (missing.length === 0) continue;
    dogs.push({ dog_id: line.dog_id, dog_name: dogName, missing });
    messages.push(
      owner
        ? `Add the owner's ${formatPartList(missing)} to enter ${dogName} in an AKC trial. AKC prints the owner's address in the marked catalog.`
        : `${dogName} has no owner on file. AKC prints the owner's name and address in the marked catalog, so add the owner before entering an AKC trial.`
    );
  }
  if (dogs.length === 0) return null;
  return { code: OWNER_ADDRESS_REQUIRED_CODE, error: messages[0]!, dogs };
}
