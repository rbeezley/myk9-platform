import { describe, expect, it } from 'vitest';
import { normalizeContactDestinations } from '../contactDestinations';

describe('normalizeContactDestinations', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['   ', null],
  ])('omits an unusable website value %j', (website, expected) => {
    expect(normalizeContactDestinations({ website }).website).toBe(expected);
  });

  it('normalizes email, phone, and a bare website host', () => {
    expect(
      normalizeContactDestinations({
        email: '  club@example.com ',
        phone: ' 555-0100 ',
        website: 'example.com/about',
      })
    ).toEqual({
      email: 'mailto:club@example.com',
      phone: 'tel:555-0100',
      website: 'https://example.com/about',
    });
  });

  it('preserves http and https destinations', () => {
    expect(normalizeContactDestinations({ website: 'https://example.com' }).website).toBe(
      'https://example.com/'
    );
    expect(normalizeContactDestinations({ website: 'http://example.com' }).website).toBe(
      'http://example.com/'
    );
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'ftp://example.com'])(
    'rejects unsupported website scheme %s',
    website => {
      expect(normalizeContactDestinations({ website }).website).toBeNull();
    }
  );
});
