export interface GeocodeResult {
  lat: number;
  lng: number;
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Geocode a venue address via Nominatim (OpenStreetMap).
 *
 * Called once per explicit secretary action (address confirm / "Locate" click),
 * never in a loop — keeps us well inside Nominatim's usage policy. Browsers
 * identify the app via the Referer header; a custom User-Agent cannot be set
 * from browser JS.
 *
 * Returns null on miss, HTTP error, network failure, or malformed response —
 * geocoding must never block show management.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const query = address.trim();
  if (!query) return null;

  const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;

    const results: unknown = await response.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const first = results[0] as { lat?: unknown; lon?: unknown };
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}
