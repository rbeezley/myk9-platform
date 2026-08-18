import L from 'leaflet';

export interface VenuePinValue {
  lat: number;
  lng: number;
}

/**
 * Clicks and drags on Leaflet's repeated world copies yield longitudes outside
 * ±180, which the DB's shows_longitude_range CHECK rejects — wrap them back.
 */
export function normalizePinValue(lat: number, lng: number): VenuePinValue {
  const clampedLat = Math.min(90, Math.max(-90, lat));
  // Only wrap out-of-range longitudes — .wrap() adds float error to in-range ones.
  const wrappedLng = lng >= -180 && lng <= 180 ? lng : L.latLng(clampedLat, lng).wrap().lng;
  return { lat: clampedLat, lng: wrappedLng };
}
