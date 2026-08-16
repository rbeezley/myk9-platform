export interface PlaceSuggestion {
  placeId: string;
  /** Full prediction text, e.g. "Purina Farms, Checkerboard Loop, Gray Summit, MO". */
  text: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  /** Venue display name, e.g. "Purina Farms". Empty for plain street addresses. */
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places';

export function getPlacesApiKey(): string {
  return ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '').trim();
}

/** Places Autocomplete is a progressive enhancement — absent key, the venue
 * address field stays a plain textarea with the Nominatim "Locate" flow. */
export function isPlacesAutocompleteConfigured(): boolean {
  return getPlacesApiKey().length > 0;
}

/**
 * Autocomplete bills per SESSION, not per keystroke: every suggestion request
 * must carry the same token, which the terminating Place Details call consumes.
 * Dropping the token (or minting one per request) multiplies cost.
 */
export function newPlacesSessionToken(): string {
  return crypto.randomUUID();
}

/**
 * Fetch venue suggestions for a partial address. Returns [] on HTTP error,
 * network failure, or malformed response — address entry must never block on
 * Google. Aborting via `signal` also resolves to [].
 */
export async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (!query) return [];

  try {
    const response = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getPlacesApiKey(),
      },
      body: JSON.stringify({
        input: query,
        sessionToken,
        includedRegionCodes: ['us'],
      }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return [];

    const data: unknown = await response.json();
    const suggestions = (data as { suggestions?: unknown }).suggestions;
    if (!Array.isArray(suggestions)) return [];

    const results: PlaceSuggestion[] = [];
    for (const entry of suggestions) {
      const prediction = (entry as { placePrediction?: unknown }).placePrediction as
        | {
            placeId?: unknown;
            text?: { text?: unknown };
            structuredFormat?: {
              mainText?: { text?: unknown };
              secondaryText?: { text?: unknown };
            };
          }
        | undefined;
      if (!prediction || typeof prediction.placeId !== 'string') continue;

      const text = typeof prediction.text?.text === 'string' ? prediction.text.text : '';
      const mainText =
        typeof prediction.structuredFormat?.mainText?.text === 'string'
          ? prediction.structuredFormat.mainText.text
          : text;
      const secondaryText =
        typeof prediction.structuredFormat?.secondaryText?.text === 'string'
          ? prediction.structuredFormat.secondaryText.text
          : '';

      results.push({ placeId: prediction.placeId, text, mainText, secondaryText });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Resolve a selected suggestion to its address and coordinates. Passing the
 * session token here terminates the billing session. Returns null on any
 * failure — the caller falls back to the suggestion's text without a pin.
 */
export async function fetchPlaceDetails(
  placeId: string,
  sessionToken: string
): Promise<PlaceDetails | null> {
  const url = `${DETAILS_BASE_URL}/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': getPlacesApiKey(),
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      displayName?: { text?: unknown };
      formattedAddress?: unknown;
      location?: { latitude?: unknown; longitude?: unknown };
    };

    const address = typeof data.formattedAddress === 'string' ? data.formattedAddress : '';
    const lat = Number(data.location?.latitude);
    const lng = Number(data.location?.longitude);
    if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      name: typeof data.displayName?.text === 'string' ? data.displayName.text : '',
      address,
      lat,
      lng,
    };
  } catch {
    return null;
  }
}

/** "Purina Farms" + "200 Checkerboard Loop, Gray Summit, MO 63039" →
 * "Purina Farms, 200 Checkerboard Loop, ..." — the venue name is what
 * exhibitors recognize, and the address is what navigation needs. */
export function formatVenueLocation(details: PlaceDetails): string {
  if (!details.name || details.address.toLowerCase().includes(details.name.toLowerCase())) {
    return details.address;
  }
  return `${details.name}, ${details.address}`;
}
