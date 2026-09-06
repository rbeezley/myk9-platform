import type { LatLng } from './distance';

export type ViewerLocationSource = 'profile' | 'remembered' | 'ip' | 'device';

export interface ViewerLocation extends LatLng {
  /** What the Near field shows: "Tulsa, OK", "Your location". */
  label: string;
  source: ViewerLocationSource;
}

/**
 * What the visitor chose on this device: a location they typed or picked, or
 * an explicit "Anywhere" that must beat the profile and connection guesses.
 */
export type RememberedLocation =
  { kind: 'location'; label: string; lat: number; lng: number } | { kind: 'anywhere' };

export const REMEMBERED_LOCATION_KEY = 'myk9.findShows.location';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readRememberedLocation(
  storage: Pick<Storage, 'getItem'> | null = safeStorage()
): RememberedLocation | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REMEMBERED_LOCATION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (value.kind === 'anywhere') return { kind: 'anywhere' };
    if (
      value.kind === 'location' &&
      typeof value.label === 'string' &&
      value.label.trim() &&
      isFiniteNumber(value.lat) &&
      isFiniteNumber(value.lng)
    ) {
      return { kind: 'location', label: value.label, lat: value.lat, lng: value.lng };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeRememberedLocation(
  value: RememberedLocation | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()
): void {
  if (!storage) return;
  try {
    if (value === null) storage.removeItem(REMEMBERED_LOCATION_KEY);
    else storage.setItem(REMEMBERED_LOCATION_KEY, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the choice simply does not persist.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface ResolveViewerLocationInput {
  /** The signed-in profile's location, already geocoded; null when unknown. */
  profile: ViewerLocation | null;
  remembered: RememberedLocation | null;
  /** The approximate city from the visitor's connection; null when unknown. */
  ip: ViewerLocation | null;
}

/**
 * First match wins: a location the visitor chose on this device, then the
 * profile, then the connection's approximate city, then nothing. An explicit
 * "Anywhere" choice beats both guesses — otherwise the profile would reassert
 * itself on every visit after the visitor cleared it.
 */
export function resolveViewerLocation({
  profile,
  remembered,
  ip,
}: ResolveViewerLocationInput): ViewerLocation | null {
  if (remembered?.kind === 'anywhere') return null;
  if (remembered?.kind === 'location') {
    return {
      label: remembered.label,
      lat: remembered.lat,
      lng: remembered.lng,
      source: 'remembered',
    };
  }
  return profile ?? ip ?? null;
}

/** "Tulsa, OK 74101" → "Tulsa, OK"; a profile with only a zip still geocodes. */
export function profileAddressQuery(profile: {
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}): string | null {
  const cityState = [profile.city, profile.state]
    .map(v => v?.trim())
    .filter(Boolean)
    .join(', ');
  const query = cityState || profile.zip_code?.trim() || '';
  return query || null;
}
