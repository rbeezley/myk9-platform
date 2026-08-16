// Venue static-map assets for confirmation emails.
//
// Pure module (no Deno APIs) so vitest can cover it: index.ts reads the env
// key and passes it in. NOTE: the API key ends up inside the email's <img>
// URL, which recipients can read — use a key restricted to the Maps Static
// API ONLY (referrer restrictions don't work for email clients), and keep a
// budget alert on the Google Cloud project.

import { esc, type VenueMapAssetsRef } from './confirmation-email-shared.ts';

/** imageUrl: Maps Static API image, 600x300 @2x, red marker on the venue.
 *  linkUrl: universal Google Maps directions link (iOS, Android, desktop). */
export type VenueMapAssets = VenueMapAssetsRef;

export function buildVenueMapAssets(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  apiKey: string | null | undefined
): VenueMapAssets | null {
  const key = (apiKey ?? '').trim();
  if (!key) return null;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const center = `${latitude},${longitude}`;
  const params = new URLSearchParams({
    center,
    zoom: '15',
    size: '600x300',
    scale: '2',
    markers: `color:red|${center}`,
    key,
  });

  return {
    imageUrl: `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`,
    linkUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(center)}`,
  };
}

/**
 * Email-safe venue map block: a linked <img> that opens directions. Renders
 * '' when assets are absent so every template can interpolate unconditionally.
 * Deliberately neutral styling — it sits inside seven differently-themed
 * templates and must not clash with any of them.
 */
export function renderVenueMapBlock(
  venueMap: VenueMapAssets | null | undefined,
  venue: string | null
): string {
  if (!venueMap) return '';
  const venueFirstLine = venue?.split('\n')[0]?.trim();
  const alt = venueFirstLine ? `Map to ${venueFirstLine}` : 'Map to the venue';
  return `<a href="${esc(venueMap.linkUrl)}" target="_blank" style="display:block;margin:14px 0 0;text-decoration:none;">
  <img src="${esc(venueMap.imageUrl)}" alt="${esc(alt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:1px solid #cfc8ba;border-radius:4px;margin:0 auto;"/>
</a>`;
}
