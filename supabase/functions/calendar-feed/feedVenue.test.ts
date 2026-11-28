import { describe, expect, it } from 'vitest';
import { feedVenue } from './feedVenue';

describe('feedVenue', () => {
  it('is the typed address when only location is set', () => {
    expect(feedVenue({ location: '500 Fair Lane, Lima, OH', city: null, state: null })).toBe(
      '500 Fair Lane, Lima, OH'
    );
  });

  it('puts the venue name and the typed address on one line', () => {
    expect(feedVenue({ venue_name: 'Expo Hall', location: '1 Main St, Austin, TX' })).toBe(
      'Expo Hall, 1 Main St, Austin, TX'
    );
  });

  it('falls back to the separate columns, and is null with nothing', () => {
    expect(feedVenue({ venue_name: 'Barn', address: '2 Rd', city: 'Lima', state: 'OH' })).toBe(
      'Barn, 2 Rd, Lima, OH'
    );
    expect(feedVenue({ location: null })).toBeNull();
  });
});
