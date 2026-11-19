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
  // A part equal to one already printed (case aside) is not repeated: a location typed as the
  // street itself, or as the whole address, prints once. Whole-part equality only, no guessing.
  const printed: string[] = [];
  for (const part of [label, address, locality]) {
    if (part && !printed.some(p => p.toLowerCase() === part.toLowerCase())) printed.push(part);
  }
  const whole = printed.join(', ');
  if (
    label &&
    label.toLowerCase() === [address, locality].filter(Boolean).join(', ').toLowerCase()
  ) {
    return label;
  }
  return whole;
}
