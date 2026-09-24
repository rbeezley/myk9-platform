import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodeAddress, normalizeGeocodeQuery, NOMINATIM_SEARCH_URL } from './geocode';

/** A real-shaped Nominatim `format=jsonv2` hit (trimmed of fields we ignore). */
const NOMINATIM_HIT = [
  {
    place_id: 318276425,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
    osm_type: 'way',
    osm_id: 19716543,
    lat: '39.7817213',
    lon: '-89.6501481',
    category: 'building',
    type: 'house',
    place_rank: 30,
    importance: 0.00000999999999995449,
    addresstype: 'building',
    name: '',
    display_name:
      '1024, South Oak Lane, Springfield, Sangamon County, Illinois, 62704, United States',
    boundingbox: ['39.7816713', '39.7817713', '-89.6501981', '-89.6500981'],
  },
];

function requestedQuery(): string {
  const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
  return url.searchParams.get('q') ?? '';
}

describe('normalizeGeocodeQuery (MYK9-686)', () => {
  it.each([
    // The Location field is "venue name and address" in a 3-row textarea.
    [
      'Happy Paws Training Center\n1024 S Oak Ln\nSpringfield, IL 62704',
      '1024 S Oak Ln, Springfield, IL 62704',
    ],
    // Units and ZIP+4 make Nominatim miss an otherwise exact residential match.
    ['1024 S Oak Ln Apt 4B, Springfield, IL 62704-1234', '1024 S Oak Ln, Springfield, IL 62704'],
    ['1024 S Oak Ln, Unit 7, Springfield, IL 62704', '1024 S Oak Ln, Springfield, IL 62704'],
    ['500 Main St Suite #210\nAustin, TX 78701', '500 Main St, Austin, TX 78701'],
    ['500 Main St # 210, Austin, TX 78701', '500 Main St, Austin, TX 78701'],
    // A state abbreviation that looks like a designator ("FL") is kept.
    ['12 Palm Ave, Miami, FL 33101', '12 Palm Ave, Miami, FL 33101'],
    // Extra whitespace and blank lines collapse.
    ['  1024   S Oak Ln ,\n\n Springfield ,  IL  62704 ', '1024 S Oak Ln, Springfield, IL 62704'],
    // No street number anywhere: nothing is dropped as a "venue name".
    [
      'Sangamon County Fairgrounds, Springfield, IL',
      'Sangamon County Fairgrounds, Springfield, IL',
    ],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeGeocodeQuery(input)).toBe(expected);
  });

  it.each(['', '   ', '12345', '#4', ', ,\n'])('rejects %j as not an address', input => {
    expect(normalizeGeocodeQuery(input)).toBeNull();
  });
});

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('locates a valid US residential address from a real-shaped Nominatim response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(NOMINATIM_HIT), { status: 200 })
    );

    const result = await geocodeAddress(
      'Happy Paws Training Center\n1024 S Oak Ln Apt 4B\nSpringfield, IL 62704-1234'
    );

    expect(result).toEqual({ status: 'found', lat: 39.7817213, lng: -89.6501481 });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url.startsWith(`${NOMINATIM_SEARCH_URL}?`)).toBe(true);
    expect(requestedQuery()).toBe('1024 S Oak Ln, Springfield, IL 62704');
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('limit=1');
  });

  it('reports not_found when Nominatim has no match', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('[]', { status: 200 }));
    expect(await geocodeAddress('1 Nowhere Rd, Nowhere, ZZ')).toEqual({ status: 'not_found' });
  });

  it.each([429, 500, 503])('reports unavailable on HTTP %i', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status }));
    expect(await geocodeAddress('1024 S Oak Ln, Springfield, IL')).toEqual({
      status: 'unavailable',
    });
  });

  it('reports unavailable when fetch rejects (network error, timeout, CSP block)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await geocodeAddress('1024 S Oak Ln, Springfield, IL')).toEqual({
      status: 'unavailable',
    });
  });

  it('reports unavailable for a malformed provider response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ lat: 'not-a-number', lon: '-87.6298' }]), { status: 200 })
    );
    expect(await geocodeAddress('1024 S Oak Ln, Springfield, IL')).toEqual({
      status: 'unavailable',
    });
  });

  it('reports invalid for malformed input without calling the network', async () => {
    expect(await geocodeAddress('   ')).toEqual({ status: 'invalid' });
    expect(await geocodeAddress('12345')).toEqual({ status: 'invalid' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
