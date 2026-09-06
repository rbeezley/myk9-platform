import { describe, expect, it } from 'vitest';
import { distanceMiles, formatMiles, showDistanceMiles } from './distance';

const TULSA = { lat: 36.154, lng: -95.9928 };
const OKC = { lat: 35.4676, lng: -97.5164 };
const SPRINGDALE_AR = { lat: 36.1867, lng: -94.1288 };

describe('distanceMiles', () => {
  it('matches known city pairs within a mile or two', () => {
    expect(distanceMiles(TULSA, OKC)).toBeCloseTo(97.7, 0);
    expect(distanceMiles(TULSA, SPRINGDALE_AR)).toBeCloseTo(104.1, 0);
  });

  it('is symmetric and zero for the same point', () => {
    expect(distanceMiles(TULSA, OKC)).toBeCloseTo(distanceMiles(OKC, TULSA), 6);
    expect(distanceMiles(TULSA, TULSA)).toBe(0);
  });

  it('crosses the antimeridian the short way', () => {
    const west = { lat: 0, lng: 179.5 };
    const east = { lat: 0, lng: -179.5 };
    expect(distanceMiles(west, east)).toBeLessThan(70);
  });
});

describe('formatMiles', () => {
  it('rounds to whole miles with a thousands separator and a floor label', () => {
    expect(formatMiles(0.4)).toBe('<1 mi');
    expect(formatMiles(12.49)).toBe('12 mi');
    expect(formatMiles(1240.2)).toBe('1,240 mi');
  });
});

describe('showDistanceMiles', () => {
  it('returns null without an origin or without a venue pin', () => {
    expect(showDistanceMiles(null, { latitude: 1, longitude: 1 })).toBeNull();
    expect(showDistanceMiles(TULSA, { latitude: null, longitude: -95 })).toBeNull();
    expect(showDistanceMiles(TULSA, {})).toBeNull();
  });

  it('measures to the pin when both are known', () => {
    expect(showDistanceMiles(TULSA, { latitude: OKC.lat, longitude: OKC.lng })).toBeCloseTo(
      97.7,
      0
    );
  });
});
