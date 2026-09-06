import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * /api/geo — where is this visitor, roughly, and where is a typed place?
 *
 * Two modes, both used by the Find Shows "Near" field:
 *
 * - `GET /api/geo` reads the approximate city Vercel attaches to every request
 *   (`x-vercel-ip-*` headers). City-level, no permission prompt, labelled
 *   approximate in the UI. 204 when the headers are absent (local dev, some
 *   proxies).
 * - `GET /api/geo?q=Tulsa, OK` geocodes a typed place through Nominatim from
 *   the server, so the browser never talks to a host outside its CSP and the
 *   request carries the User-Agent Nominatim's policy asks for. Cached at the
 *   edge for a day; a miss is 404.
 */

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  approximate: boolean;
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'myK9Show/1.0 (find-shows near field; https://myk9show.com)';
const MAX_QUERY_LENGTH = 120;

function header(req: Pick<VercelRequest, 'headers'>, name: string): string | null {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.trim() ? first.trim() : null;
}

function finite(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The approximate location Vercel derived from the connection, or null. */
export function locationFromRequest(req: Pick<VercelRequest, 'headers'>): GeoResult | null {
  const lat = finite(header(req, 'x-vercel-ip-latitude'));
  const lng = finite(header(req, 'x-vercel-ip-longitude'));
  if (lat === null || lng === null) return null;
  // Vercel URL-encodes the city ("San%20Jose").
  const rawCity = header(req, 'x-vercel-ip-city');
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity);
    } catch {
      city = rawCity;
    }
  }
  const region = header(req, 'x-vercel-ip-country-region');
  const country = header(req, 'x-vercel-ip-country');
  const parts = [city, region ?? (country && country !== 'US' ? country : null)].filter(Boolean);
  const label = parts.join(', ') || 'Near you';
  return { label, lat, lng, approximate: true };
}

interface NominatimHit {
  lat?: unknown;
  lon?: unknown;
  address?: Record<string, unknown>;
  display_name?: unknown;
}

/** "Tulsa, Oklahoma" from the address parts, else the first display-name segment. */
export function labelFromNominatim(hit: NominatimHit, fallback: string): string {
  const address = hit.address ?? {};
  const locality = ['city', 'town', 'village', 'hamlet', 'county']
    .map(k => address[k])
    .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const state = typeof address.state === 'string' ? address.state : null;
  if (locality) return state ? `${locality}, ${state}` : locality;
  if (typeof hit.display_name === 'string' && hit.display_name.trim()) {
    return hit.display_name.split(',').slice(0, 2).join(',').trim();
  }
  return fallback;
}

export async function geocodePlace(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<GeoResult | null> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return null;
  const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=1`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const hits: unknown = await response.json();
    if (!Array.isArray(hits) || hits.length === 0) return null;
    const first = hits[0] as NominatimHit;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { label: labelFromNominatim(first, q), lat, lng, approximate: false };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const rawQuery = req.query.q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;

  if (typeof query === 'string' && query.trim()) {
    const result = await geocodePlace(query);
    if (!result) return res.status(404).json({ error: 'No match for that place' });
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600');
    return res.status(200).json(result);
  }

  const approximate = locationFromRequest(req);
  // Per-visitor: never let a CDN hand one person's city to the next.
  res.setHeader('Cache-Control', 'private, no-store');
  if (!approximate) return res.status(204).end();
  return res.status(200).json(approximate);
}
