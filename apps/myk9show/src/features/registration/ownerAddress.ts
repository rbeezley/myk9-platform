/**
 * MYK9-1010: the owner's address an AKC entry needs.
 *
 * AKC Scent Work Regulations Ch.3 §36 item 8 puts the owner's address on every
 * dog in the marked catalog, so an AKC entry needs all four parts. This is the
 * ONE client predicate; onboarding, the class-selection block and the wizard's
 * copy all read it. The server mirrors it, part for part and label for label:
 * `submit_show_entries` (supabase/migrations/20261008183700_myk9_1010_*.sql)
 * and `stripe-checkout` (`_shared/cartOwnerAddressGate.ts`).
 */

export interface AddressPartsLike {
  streetAddress?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  zipCode?: string | null | undefined;
}

/** Each part with the words used for it in every message, in address order. */
export const OWNER_ADDRESS_PARTS = [
  ['streetAddress', 'street address'],
  ['city', 'city'],
  ['state', 'state or province'],
  ['zipCode', 'ZIP or postal code'],
] as const;

/** The labels of the parts that are blank after trimming, in address order. */
export function ownerAddressMissingParts(address: AddressPartsLike): string[] {
  return OWNER_ADDRESS_PARTS.filter(([key]) => !address[key]?.trim()).map(([, label]) => label);
}

/** "a", "a and b", "a, b and c". */
export function formatPartList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
