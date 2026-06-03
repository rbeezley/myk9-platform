import { describe, expect, it } from 'vitest';
import { buildVenueMapsUrls, formatVenueAddress } from './venueMaps';

describe('formatVenueAddress', () => {
  it('comma-joins venue, city, and state', () => {
    expect(formatVenueAddress(['Olathe Convention Center', 'Olathe', 'KS'])).toBe(
      'Olathe Convention Center, Olathe, KS'
    );
  });

  it('skips blank, null, and undefined parts', () => {
    expect(formatVenueAddress(['', 'Olathe', 'KS'])).toBe('Olathe, KS');
    expect(formatVenueAddress([null, undefined, 'KS'])).toBe('KS');
    expect(formatVenueAddress(['  ', 'Olathe', '  '])).toBe('Olathe');
  });

  it('returns an empty string when every part is blank', () => {
    expect(formatVenueAddress(['', null, undefined])).toBe('');
  });
});

describe('buildVenueMapsUrls', () => {
  it('builds the exact Google Maps directions + search URLs with an encoded query', () => {
    const { directionsUrl, viewOnMapsUrl } = buildVenueMapsUrls(
      'Olathe Convention Center, Olathe, KS'
    );

    expect(directionsUrl).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Olathe%20Convention%20Center%2C%20Olathe%2C%20KS'
    );
    expect(viewOnMapsUrl).toBe(
      'https://www.google.com/maps/search/?api=1&query=Olathe%20Convention%20Center%2C%20Olathe%2C%20KS'
    );
  });
});
