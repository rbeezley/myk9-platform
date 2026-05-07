import { describe, it, expect } from 'vitest';
import { getShowLandingStyle, getTrialRegistry, getTrialTimezone } from '../helpers';
import { akcRegistry } from '../akc';

describe('getShowLandingStyle', () => {
  it('returns "heritage" when the show has landing_style = "heritage"', () => {
    expect(getShowLandingStyle({ landing_style: 'heritage' })).toBe('heritage');
  });

  it('returns "default" for an explicit "default" value', () => {
    expect(getShowLandingStyle({ landing_style: 'default' })).toBe('default');
  });

  it('returns "default" when the column is null, undefined, or missing', () => {
    expect(getShowLandingStyle({ landing_style: null })).toBe('default');
    expect(getShowLandingStyle({ landing_style: undefined })).toBe('default');
    expect(getShowLandingStyle({})).toBe('default');
    expect(getShowLandingStyle(null)).toBe('default');
    expect(getShowLandingStyle(undefined)).toBe('default');
  });

  it('returns "default" for an unrecognized value (forward-compat)', () => {
    expect(getShowLandingStyle({ landing_style: 'magazine' })).toBe('default');
  });
});

describe('getTrialRegistry', () => {
  it('returns the AKC registry when registry_id = "AKC"', () => {
    expect(getTrialRegistry({ registry_id: 'AKC' })).toBe(akcRegistry);
  });

  it('returns AKC when registry_id is null/undefined/missing', () => {
    expect(getTrialRegistry({ registry_id: null })).toBe(akcRegistry);
    expect(getTrialRegistry({})).toBe(akcRegistry);
    expect(getTrialRegistry(null)).toBe(akcRegistry);
  });

  it('throws in dev for an unknown registry id', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      expect(() => getTrialRegistry({ registry_id: 'FAKE' })).toThrow(/unknown registry/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('getTrialTimezone', () => {
  it('returns the trial timezone when set', () => {
    expect(getTrialTimezone({ timezone: 'America/Chicago' })).toBe('America/Chicago');
  });

  it('falls back to America/New_York when missing', () => {
    expect(getTrialTimezone({ timezone: null })).toBe('America/New_York');
    expect(getTrialTimezone({})).toBe('America/New_York');
    expect(getTrialTimezone(undefined)).toBe('America/New_York');
  });
});
