import { describe, expect, it, vi } from 'vitest';
import { fetchApproximateLocation, geocodePlaceQuery, shouldUseGeoApi } from './geoClient';

describe('shouldUseGeoApi', () => {
  it.each(['localhost', '127.0.0.1', 'myk9show.test', 'host.docker.internal'])(
    'does not enable hosted geo by hostname alone for %s',
    hostname => {
      expect(shouldUseGeoApi(hostname, undefined, undefined, false)).toBe(false);
    }
  );

  it('enables local geo when the Vite API proxy is configured', () => {
    expect(shouldUseGeoApi('localhost', 'http://localhost:3000', undefined, true)).toBe(true);
    expect(shouldUseGeoApi('localhost', 'http://localhost:3000', undefined, false)).toBe(false);
  });

  it('allows an explicit geo opt-in and opt-out', () => {
    expect(shouldUseGeoApi('localhost', undefined, 'true', false)).toBe(true);
    expect(shouldUseGeoApi('myk9show.com', undefined, 'false', false)).toBe(false);
  });

  it.each([
    'myk9show.com',
    'staging.myk9show.com',
    'myk9-platform-myk9show-abc123-richard.vercel.app',
  ])('enables geo on supported hosted origin %s', hostname => {
    expect(shouldUseGeoApi(hostname, undefined, undefined, false)).toBe(true);
  });
});

describe('fetchApproximateLocation', () => {
  it('does not call the hosted endpoint from a local browser origin', async () => {
    const fetchImpl = vi.fn();

    await expect(fetchApproximateLocation(fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call the hosted endpoint when a local user types a place', async () => {
    const fetchImpl = vi.fn();

    await expect(geocodePlaceQuery('Tulsa, OK', 'remembered', fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
