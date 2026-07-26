import { describe, it, expect, vi } from 'vitest';

// VenuePinMap imports react-leaflet (ESM-only) — stub it; L.latLng itself is real.
vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
  useMap: () => ({}),
}));

import { normalizePinValue } from './VenuePinMap';

describe('normalizePinValue', () => {
  it('passes through in-range coordinates unchanged', () => {
    expect(normalizePinValue(36.15, -95.99)).toEqual({ lat: 36.15, lng: -95.99 });
  });

  it('wraps a longitude from a repeated world copy back into ±180', () => {
    // Clicking one world-copy east: lng + 360
    const east = normalizePinValue(36.15, -95.99 + 360);
    expect(east.lng).toBeCloseTo(-95.99, 6);
    // One copy west: lng - 360
    const west = normalizePinValue(36.15, -95.99 - 360);
    expect(west.lng).toBeCloseTo(-95.99, 6);
  });

  it('keeps boundary longitudes within the DB CHECK range', () => {
    const result = normalizePinValue(0, 180);
    expect(result.lng).toBeGreaterThanOrEqual(-180);
    expect(result.lng).toBeLessThanOrEqual(180);
  });
});
