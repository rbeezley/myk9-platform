import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPlaceDetails,
  fetchPlaceSuggestions,
  formatVenueLocation,
  isPlacesAutocompleteConfigured,
  newPlacesSessionToken,
} from './placesAutocomplete';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('isPlacesAutocompleteConfigured', () => {
  it('is false without a key and true with one', () => {
    expect(isPlacesAutocompleteConfigured()).toBe(true);
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '   ');
    expect(isPlacesAutocompleteConfigured()).toBe(false);
  });
});

describe('newPlacesSessionToken', () => {
  it('mints distinct tokens', () => {
    expect(newPlacesSessionToken()).not.toBe(newPlacesSessionToken());
  });
});

describe('fetchPlaceSuggestions', () => {
  it('sends the query with the SAME session token (per-session billing)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ suggestions: [] }));

    await fetchPlaceSuggestions('purina farms', 'token-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-key' }),
      })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      input: 'purina farms',
      sessionToken: 'token-1',
      includedRegionCodes: ['us'],
    });
  });

  it('parses placePrediction entries and skips malformed ones', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: 'p1',
              text: { text: 'Purina Farms, Gray Summit, MO' },
              structuredFormat: {
                mainText: { text: 'Purina Farms' },
                secondaryText: { text: 'Gray Summit, MO' },
              },
            },
          },
          { placePrediction: { text: { text: 'no placeId — dropped' } } },
          { somethingElse: true },
        ],
      })
    );

    const results = await fetchPlaceSuggestions('purina', 'token-1');

    expect(results).toEqual([
      {
        placeId: 'p1',
        text: 'Purina Farms, Gray Summit, MO',
        mainText: 'Purina Farms',
        secondaryText: 'Gray Summit, MO',
      },
    ]);
  });

  it('returns [] on HTTP error, network failure, malformed body, and empty input', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    expect(await fetchPlaceSuggestions('a query', 't')).toEqual([]);

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchPlaceSuggestions('a query', 't')).toEqual([]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ suggestions: 'not-an-array' }));
    expect(await fetchPlaceSuggestions('a query', 't')).toEqual([]);

    expect(await fetchPlaceSuggestions('   ', 't')).toEqual([]);
    // Empty input short-circuits without a request.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('fetchPlaceDetails', () => {
  it('terminates the session by passing the token, with a narrow field mask', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        displayName: { text: 'Purina Farms' },
        formattedAddress: '200 Checkerboard Loop, Gray Summit, MO 63039',
        location: { latitude: 38.49, longitude: -90.82 },
      })
    );

    const details = await fetchPlaceDetails('p1', 'token-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/p1?sessionToken=token-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-key',
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
        }),
      })
    );
    expect(details).toEqual({
      name: 'Purina Farms',
      address: '200 Checkerboard Loop, Gray Summit, MO 63039',
      lat: 38.49,
      lng: -90.82,
    });
  });

  it('returns null on HTTP error, network failure, or missing coordinates', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    expect(await fetchPlaceDetails('p1', 't')).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchPlaceDetails('p1', 't')).toBeNull();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ formattedAddress: 'somewhere', location: { latitude: 'x' } })
    );
    expect(await fetchPlaceDetails('p1', 't')).toBeNull();
  });
});

describe('formatVenueLocation', () => {
  it('prefixes the venue name when the address lacks it', () => {
    expect(
      formatVenueLocation({ name: 'Purina Farms', address: '200 Checkerboard Loop', lat: 0, lng: 0 })
    ).toBe('Purina Farms, 200 Checkerboard Loop');
  });

  it('avoids doubling a name already present in the address', () => {
    expect(
      formatVenueLocation({
        name: 'Purina Farms',
        address: 'Purina Farms, 200 Checkerboard Loop',
        lat: 0,
        lng: 0,
      })
    ).toBe('Purina Farms, 200 Checkerboard Loop');
  });

  it('returns the bare address for nameless results', () => {
    expect(formatVenueLocation({ name: '', address: '123 Main St', lat: 0, lng: 0 })).toBe(
      '123 Main St'
    );
  });
});
