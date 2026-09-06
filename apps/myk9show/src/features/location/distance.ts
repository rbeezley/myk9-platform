export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in statute miles (haversine). */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "12 mi" / "1,240 mi"; under a mile reads as "<1 mi". */
export function formatMiles(miles: number): string {
  if (miles < 1) return '<1 mi';
  return `${Math.round(miles).toLocaleString('en-US')} mi`;
}

/**
 * Distance from `origin` to a show's venue, or null when the show has no pin
 * or the origin is unknown.
 */
export function showDistanceMiles(
  origin: LatLng | null | undefined,
  show: { latitude?: number | null; longitude?: number | null }
): number | null {
  if (!origin || show.latitude == null || show.longitude == null) return null;
  return distanceMiles(origin, { lat: show.latitude, lng: show.longitude });
}

/** Radius choices for the Distance chip, in miles; the only thing a location ever hides by. */
export const RADIUS_OPTIONS = ['50', '100', '250', '500'] as const;
