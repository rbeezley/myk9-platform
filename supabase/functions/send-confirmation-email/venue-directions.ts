// Keyless "Get directions" link for confirmation emails.
//
// Pure module (no Deno APIs) so vitest can cover it. No API key is involved:
// the link is a universal Google Maps directions URL (iOS, Android, desktop).

import { esc, type VenueMapAssetsRef } from './confirmation-email-shared.ts';

/** linkUrl: universal Google Maps directions link. */
export type VenueMapAssets = VenueMapAssetsRef;

const DIRECTIONS_BASE = 'https://www.google.com/maps/dir/?api=1&destination=';

/**
 * Directions link for a venue. Prefers the secretary-placed pin (lat/long);
 * otherwise falls back to the venue address text. Null when neither exists.
 */
export function buildVenueMapAssets(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  address?: string | null
): VenueMapAssets | null {
  const hasPin =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  if (hasPin) {
    return { linkUrl: `${DIRECTIONS_BASE}${encodeURIComponent(`${latitude},${longitude}`)}` };
  }

  const text = (address ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(', ');
  if (!text) return null;
  return { linkUrl: `${DIRECTIONS_BASE}${encodeURIComponent(text)}` };
}

/**
 * Email-safe "Get directions" link. Renders '' when absent so every template
 * can interpolate unconditionally. Deliberately neutral styling (it sits
 * inside seven differently-themed templates); padding gives a 48px tap target.
 */
export function renderVenueMapBlock(
  venueMap: VenueMapAssets | null | undefined,
  venue: string | null
): string {
  if (!venueMap) return '';
  const venueFirstLine = venue?.split('\n')[0]?.trim();
  const label = venueFirstLine
    ? `Get directions to ${venueFirstLine}`
    : 'Get directions to the venue';
  return `<p style="margin:14px 0 0;"><a href="${esc(venueMap.linkUrl)}" target="_blank" aria-label="${esc(label)}" style="display:inline-block;padding:14px 20px;line-height:20px;min-height:20px;font-size:15px;font-weight:bold;color:#1a4fa0;text-decoration:underline;border:1px solid #cfc8ba;border-radius:4px;">Get directions</a></p>`;
}
