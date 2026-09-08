import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import * as geoClient from './geoClient';
import {
  REMEMBERED_LOCATION_KEY,
  type RememberedLocation,
  type ViewerLocation,
} from './viewerLocation';
import { useViewerLocation } from './useViewerLocation';

function setup(
  options: {
    remembered?: RememberedLocation;
    profile?: Record<string, unknown>;
    geocoded?: ViewerLocation | null;
    geocodeError?: boolean;
    geocodePromise?: Promise<ViewerLocation | null>;
    personId?: string;
  } = {}
) {
  const remembered = options.remembered;
  localStorage.removeItem(REMEMBERED_LOCATION_KEY);
  if (remembered) localStorage.setItem(REMEMBERED_LOCATION_KEY, JSON.stringify(remembered));
  const client = createTestQueryClient();
  // Match the app's keep-previous-data default, including account changes.
  client.setDefaultOptions({
    queries: {
      ...client.getDefaultOptions().queries,
      placeholderData: (previous: unknown) => previous,
    },
  });
  const approximate = vi.spyOn(geoClient, 'fetchApproximateLocation').mockResolvedValue({
    label: 'Fixture City',
    lat: 36,
    lng: -96,
    source: 'ip',
  });
  const geocode = vi
    .spyOn(geoClient, 'geocodePlaceQuery')
    .mockResolvedValue(options.geocoded ?? null);
  if (options.geocodeError) geocode.mockRejectedValue(new Error('Geocoding unavailable'));
  if (options.geocodePromise) geocode.mockReturnValue(options.geocodePromise);
  const profile = createChainableQuery(
    options.profile ?? {
      data: { city: null, state: null, zip_code: null },
      error: null,
    }
  );
  mockSupabase.from.mockReturnValue(profile);
  const device = vi.fn();
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: device } });
  const hook = renderHook(({ personId }) => useViewerLocation(personId), {
    initialProps: { personId: options.personId ?? ('fixture-person' as string | undefined) },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client, approximate, geocode, profile, device };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem(REMEMBERED_LOCATION_KEY);
});

describe('useViewerLocation fallback', () => {
  it('looks up the approximate city after a signed-in profile has no address', async () => {
    const { result, approximate, profile, device } = setup();
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(approximate).toHaveBeenCalledTimes(1);
    expect(profile.eq).toHaveBeenCalledWith('id', 'fixture-person');
    expect(result.current.location).toEqual({
      label: 'Fixture City',
      lat: 36,
      lng: -96,
      source: 'ip',
    });
    expect(device).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'missing profile', profile: { data: null, error: null } },
    { name: 'profile read error', profile: { data: null, error: { code: 'offline' } } },
    {
      name: 'geocoding miss',
      profile: { data: { city: 'Missing', state: 'OK', zip_code: null }, error: null },
    },
    {
      name: 'geocoding failure',
      profile: { data: { city: 'Missing', state: 'OK', zip_code: null }, error: null },
      geocodeError: true,
    },
  ])('falls back after $name', async options => {
    const { result, approximate } = setup(options);
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(approximate).toHaveBeenCalledTimes(1);
    expect(result.current.location?.source).toBe('ip');
    expect(result.current.location?.label).toBe('Fixture City');
  });

  it('keeps a valid profile ahead of the approximate city', async () => {
    const { result, approximate, geocode } = setup({
      profile: { data: { city: 'Tulsa', state: 'OK', zip_code: '74101' }, error: null },
      geocoded: { label: 'Tulsa, OK', lat: 36.15, lng: -95.99, source: 'profile' },
    });
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(geocode).toHaveBeenCalledWith('Tulsa, OK', 'profile');
    expect(result.current.location?.label).toBe('Tulsa, OK');
    expect(approximate).not.toHaveBeenCalled();
  });

  it('waits for an unresolved profile before requesting an approximate city', async () => {
    let finish!: (location: ViewerLocation | null) => void;
    const geocodePromise = new Promise<ViewerLocation | null>(resolve => {
      finish = resolve;
    });
    const { result, approximate, geocode } = setup({
      profile: { data: { city: 'Tulsa', state: 'OK', zip_code: null }, error: null },
      geocodePromise,
    });
    await waitFor(() => expect(geocode).toHaveBeenCalled());
    expect(result.current.isResolving).toBe(true);
    expect(approximate).not.toHaveBeenCalled();
    await act(async () => finish(null));
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.location?.source).toBe('ip');
  });

  it.each<RememberedLocation>([
    { kind: 'anywhere' },
    { kind: 'location', label: 'Chosen City', lat: 35, lng: -95 },
  ])('preserves an explicit $kind choice without an IP lookup', async remembered => {
    const { result, approximate, device } = setup({ remembered });
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.location?.label ?? null).toBe(
      remembered.kind === 'anywhere' ? null : 'Chosen City'
    );
    expect(approximate).not.toHaveBeenCalled();
    expect(device).not.toHaveBeenCalled();
  });

  it('remembers Anywhere after an approximate result arrives', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    act(() => result.current.chooseAnywhere());
    expect(result.current.location).toBeNull();
    expect(JSON.parse(localStorage.getItem(REMEMBERED_LOCATION_KEY)!)).toEqual({
      kind: 'anywhere',
    });
  });

  it('does not reuse one account profile for another account', async () => {
    const { result, rerender, client, approximate } = setup({
      geocoded: { label: 'Tulsa, OK', lat: 36.15, lng: -95.99, source: 'profile' },
      profile: { data: { city: 'Tulsa', state: 'OK', zip_code: null }, error: null },
    });
    await waitFor(() => expect(result.current.location?.label).toBe('Tulsa, OK'));
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));
    rerender({ personId: 'second-person' });
    expect(result.current.location?.label).not.toBe('Tulsa, OK');
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.location?.label).toBe('Fixture City');
    expect(approximate).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['viewerLocation', 'profile', 'second-person'])).toBeNull();
    rerender({ personId: 'fixture-person' });
    expect(result.current.location?.label).toBe('Tulsa, OK');
  });

  it('keeps the signed-out approximate fallback', async () => {
    const { result, rerender, approximate } = setup();
    rerender({ personId: undefined });
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.location?.source).toBe('ip');
    expect(approximate).toHaveBeenCalledTimes(1);
  });

  it('waits for the next account profile even when the previous profile was empty', async () => {
    const { result, rerender, approximate, geocode, client } = setup();
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    client.removeQueries({ queryKey: ['viewerLocation', 'ip'] });
    approximate.mockClear();
    let finish!: (location: ViewerLocation | null) => void;
    geocode.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    mockSupabase.from.mockReturnValue(
      createChainableQuery({
        data: { city: 'Tulsa', state: 'OK', zip_code: null },
        error: null,
      })
    );
    rerender({ personId: 'second-person' });
    await waitFor(() => expect(geocode).toHaveBeenCalled());
    expect(result.current.isResolving).toBe(true);
    expect(approximate).not.toHaveBeenCalled();
    await act(async () =>
      finish({ label: 'Tulsa, OK', lat: 36.15, lng: -95.99, source: 'profile' })
    );
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.location?.label).toBe('Tulsa, OK');
    expect(approximate).not.toHaveBeenCalled();
  });
});
