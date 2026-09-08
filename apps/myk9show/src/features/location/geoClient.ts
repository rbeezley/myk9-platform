import type { ViewerLocation } from './viewerLocation';

const GEO_ENABLED_HOSTNAMES = new Set([
  'myk9show.com',
  'www.myk9show.com',
  'app.myk9show.com',
  'staging.myk9show.com',
  'myk9-platform-myk9show.vercel.app',
]);

function isVercelPreviewHostname(hostname: string): boolean {
  return hostname.startsWith('myk9-platform-myk9show-') && hostname.endsWith('.vercel.app');
}

interface GeoPayload {
  label?: unknown;
  lat?: unknown;
  lng?: unknown;
  approximate?: unknown;
}

function parse(payload: unknown, source: ViewerLocation['source']): ViewerLocation | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { label, lat, lng } = payload as GeoPayload;
  if (typeof label !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label, lat, lng, source };
}

export function shouldUseGeoApi(
  hostname: string,
  apiUrl: string | undefined,
  enabled: string | undefined,
  isDev: boolean
): boolean {
  if (enabled === 'false') return false;
  if (enabled === 'true' || (isDev && apiUrl?.trim())) return true;

  const host = hostname.toLowerCase();
  return GEO_ENABLED_HOSTNAMES.has(host) || isVercelPreviewHostname(host);
}

function canUseHostedGeoApi(): boolean {
  return (
    typeof window === 'undefined' ||
    shouldUseGeoApi(
      window.location.hostname,
      import.meta.env.VITE_API_URL,
      import.meta.env.VITE_GEO_API_ENABLED,
      import.meta.env.DEV
    )
  );
}

/**
 * The approximate city Vercel attaches to the request; null locally, offline,
 * or when the platform has no idea. Never throws — the Near field just reads
 * "Anywhere".
 */
export async function fetchApproximateLocation(
  fetchImpl: typeof fetch = fetch
): Promise<ViewerLocation | null> {
  if (!canUseHostedGeoApi()) return null;

  try {
    const response = await fetchImpl('/api/geo', { headers: { Accept: 'application/json' } });
    if (response.status !== 200) return null;
    return parse(await response.json(), 'ip');
  } catch {
    return null;
  }
}

/** Geocode a typed place through the server; null on a miss or failure. */
export async function geocodePlaceQuery(
  query: string,
  source: ViewerLocation['source'],
  fetchImpl: typeof fetch = fetch
): Promise<ViewerLocation | null> {
  const q = query.trim();
  if (!q) return null;
  if (!canUseHostedGeoApi()) return null;

  try {
    const response = await fetchImpl(`/api/geo?q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status !== 200) return null;
    return parse(await response.json(), source);
  } catch {
    return null;
  }
}
