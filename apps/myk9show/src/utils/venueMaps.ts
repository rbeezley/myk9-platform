/**
 * Pure helpers for turning a venue location into Google Maps links.
 *
 * Shared by the show-overview `VenueMap` card and the exhibitor My Entries
 * card so the maps URL shape lives in exactly one place. These links open
 * Google Maps directly and need no API key (unlike the embedded iframe map).
 */

export interface VenueMapsUrls {
  /** "Get directions to" deep link. */
  directionsUrl: string;
  /** "View on Google Maps" search deep link. */
  viewOnMapsUrl: string;
}

/**
 * Comma-join venue address parts, skipping blank/null/undefined entries.
 * Returns '' when nothing usable remains so callers can fall back to a
 * non-interactive display.
 */
export function formatVenueAddress(parts: Array<string | null | undefined>): string {
  return parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

/**
 * Build Google Maps directions + search URLs for a free-text location/address.
 * The caller is responsible for ensuring `location` is non-empty.
 */
export function buildVenueMapsUrls(location: string): VenueMapsUrls {
  const encodedAddress = encodeURIComponent(location);
  return {
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`,
    viewOnMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
  };
}
