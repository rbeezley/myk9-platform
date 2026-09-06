import { describe, expect, it } from 'vitest';
import {
  REMEMBERED_LOCATION_KEY,
  profileAddressQuery,
  readRememberedLocation,
  resolveViewerLocation,
  writeRememberedLocation,
  type ViewerLocation,
} from './viewerLocation';

const PROFILE: ViewerLocation = { label: 'Tulsa, OK', lat: 36.15, lng: -95.99, source: 'profile' };
const IP: ViewerLocation = { label: 'Dallas, TX', lat: 32.78, lng: -96.8, source: 'ip' };

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe('resolveViewerLocation precedence', () => {
  it('a remembered location beats the profile and the connection', () => {
    const result = resolveViewerLocation({
      profile: PROFILE,
      remembered: { kind: 'location', label: 'Wichita, KS', lat: 37.69, lng: -97.34 },
      ip: IP,
    });
    expect(result).toEqual({ label: 'Wichita, KS', lat: 37.69, lng: -97.34, source: 'remembered' });
  });

  it('an explicit Anywhere beats both guesses', () => {
    expect(
      resolveViewerLocation({ profile: PROFILE, remembered: { kind: 'anywhere' }, ip: IP })
    ).toBeNull();
  });

  it('the profile beats the connection; the connection is the signed-out fallback', () => {
    expect(resolveViewerLocation({ profile: PROFILE, remembered: null, ip: IP })).toBe(PROFILE);
    expect(resolveViewerLocation({ profile: null, remembered: null, ip: IP })).toBe(IP);
  });

  it('nothing known resolves to null', () => {
    expect(resolveViewerLocation({ profile: null, remembered: null, ip: null })).toBeNull();
  });
});

describe('remembered location storage', () => {
  it('round-trips a location and an Anywhere choice', () => {
    const storage = memoryStorage();
    writeRememberedLocation({ kind: 'location', label: 'Tulsa, OK', lat: 1, lng: 2 }, storage);
    expect(readRememberedLocation(storage)).toEqual({
      kind: 'location',
      label: 'Tulsa, OK',
      lat: 1,
      lng: 2,
    });
    writeRememberedLocation({ kind: 'anywhere' }, storage);
    expect(readRememberedLocation(storage)).toEqual({ kind: 'anywhere' });
    writeRememberedLocation(null, storage);
    expect(readRememberedLocation(storage)).toBeNull();
  });

  it('ignores garbage and malformed shapes instead of throwing', () => {
    expect(
      readRememberedLocation(memoryStorage({ [REMEMBERED_LOCATION_KEY]: '{not json' }))
    ).toBeNull();
    expect(
      readRememberedLocation(
        memoryStorage({
          [REMEMBERED_LOCATION_KEY]: JSON.stringify({ kind: 'location', label: 'X', lat: 'no' }),
        })
      )
    ).toBeNull();
    expect(readRememberedLocation(null)).toBeNull();
  });
});

describe('profileAddressQuery', () => {
  it('prefers city and state, falls back to the zip, and reads nothing as null', () => {
    expect(profileAddressQuery({ city: 'Tulsa', state: 'OK', zip_code: '74101' })).toBe(
      'Tulsa, OK'
    );
    expect(profileAddressQuery({ city: ' Tulsa ', state: null })).toBe('Tulsa');
    expect(profileAddressQuery({ zip_code: '74101' })).toBe('74101');
    expect(profileAddressQuery({ city: '', state: ' ', zip_code: null })).toBeNull();
  });
});
