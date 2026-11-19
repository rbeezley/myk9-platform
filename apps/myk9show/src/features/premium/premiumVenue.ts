/**
 * MYK9-2230: the venue a premium prints, composed from the show's separate columns, never by
 * guessing at substrings of one free-text field. The label is the venue name, else the location;
 * a street address and a "City, ST 12345" line follow only when the show has an address.
 */
export interface PremiumVenueParts {
  /** shows.location, the label older premiums printed. */
  venue: string | null;
  /** shows.venue_name; wins over `venue` as the label. */
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? '').trim();

export function composePremiumVenue(parts: PremiumVenueParts): string {
  const label = clean(parts.venueName) || clean(parts.venue);
  const address = clean(parts.address);
  // No address: the location prints exactly as it always has.
  if (!address) return label;
  const city = clean(parts.city);
  const stateZip = [clean(parts.state), clean(parts.zipCode)].filter(Boolean).join(' ');
  const locality = [city, stateZip].filter(Boolean).join(', ');
  return [label, address, locality].filter(Boolean).join(', ');
}
