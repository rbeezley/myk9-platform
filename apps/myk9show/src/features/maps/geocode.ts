export type GeocodeResult =
  | { status: 'found'; lat: number; lng: number }
  /** The provider answered and has no match for this address. */
  | { status: 'not_found' }
  /** The input is not something a geocoder can locate; the network was not called. */
  | { status: 'invalid' }
  /** HTTP error, network failure, timeout, CSP block or malformed response. */
  | { status: 'unavailable' };

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

/** Secondary-unit designators, removed along with their unit number (USPS Pub 28 C2). */
const UNIT_DESIGNATOR =
  /\s*\b(?:apt|apartment|unit|suite|ste|bldg|building|rm|room|lot|spc|space|trlr|dept)\b\.?\s*#?\s*(?:[a-z]?\d[\w-]*|[a-z])\b/gi;
const HASH_UNIT = /\s*#\s*[\w-]+/g;
const ZIP_PLUS_FOUR = /\b(\d{5})-\d{4}\b/g;
const STARTS_WITH_STREET_NUMBER = /^\d+[a-z]?\b/i;

/**
 * Turn the Location field into a query a geocoder can match (MYK9-686).
 *
 * The field is "venue name and address" in a multi-line box, so a typical value
 * is `Club Name\n1024 S Oak Ln Apt 4B\nSpringfield, IL 62704-1234`. Nominatim's
 * free-text search matches none of that verbatim: the venue name, the unit and
 * the ZIP+4 each turn a real residential address into a miss. So, for the
 * QUERY only — the stored display address is never touched:
 * - lines become comma-separated parts, whitespace collapses;
 * - parts before the first one that starts with a street number are dropped
 *   (the venue name), unless no part has a street number;
 * - unit designators (Apt 4B, Suite #210, # 7) and ZIP+4 suffixes are removed.
 *
 * Returns null when nothing locatable is left (blank, digits only).
 */
export function normalizeGeocodeQuery(address: string): string | null {
  const parts = address
    .split(/[\n,]/)
    .map(part =>
      part
        .replace(UNIT_DESIGNATOR, '')
        .replace(HASH_UNIT, '')
        .replace(ZIP_PLUS_FOUR, '$1')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  const streetIndex = parts.findIndex(part => STARTS_WITH_STREET_NUMBER.test(part));
  const query = (streetIndex > 0 ? parts.slice(streetIndex) : parts).join(', ');
  return /[a-z]/i.test(query) ? query : null;
}

/**
 * Geocode a venue address via Nominatim (OpenStreetMap).
 *
 * Called once per explicit secretary action (address confirm / "Locate" click),
 * never in a loop — keeps us well inside Nominatim's usage policy (one request
 * per action, no retries here). Browsers identify the app via the Referer
 * header; a custom User-Agent cannot be set from browser JS. The production
 * CSP must list the host in `connect-src` (geocoderCspContract.test.ts).
 *
 * Never throws — geocoding must never block show management — but it says
 * WHY it has no answer, so the caller can offer the right way forward.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const query = normalizeGeocodeQuery(address);
  if (!query) return { status: 'invalid' };

  const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: 'unavailable' };

    const results: unknown = await response.json();
    if (!Array.isArray(results)) return { status: 'unavailable' };
    if (results.length === 0) return { status: 'not_found' };

    const first = results[0] as { lat?: unknown; lon?: unknown };
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'unavailable' };

    return { status: 'found', lat, lng };
  } catch {
    return { status: 'unavailable' };
  }
}
