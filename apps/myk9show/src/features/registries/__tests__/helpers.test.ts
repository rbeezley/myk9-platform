import { describe, it, expect } from 'vitest';
import {
  getShowStyle,
  getShowLandingStyle,
  getTrialRegistry,
  getTrialTimezone,
  deriveRegistryId,
} from '../helpers';
import { akcRegistry } from '../akc';
import { ukcRegistry } from '../ukc';
import { ascaRegistry } from '../asca';

describe('getShowStyle', () => {
  it('reads style column (migration 195) over landing_style', () => {
    expect(getShowStyle({ style: 'heritage', landing_style: 'default' })).toBe('heritage');
  });

  it('falls back to landing_style when style is absent', () => {
    expect(getShowStyle({ landing_style: 'heritage' })).toBe('heritage');
  });

  it('maps "default" → "monogram"', () => {
    expect(getShowStyle({ style: 'default' })).toBe('monogram');
    expect(getShowStyle({ landing_style: 'default' })).toBe('monogram');
  });

  it('passes through all 8 valid styles', () => {
    const styles = [
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage',
    ] as const;
    for (const s of styles) {
      expect(getShowStyle({ style: s })).toBe(s);
    }
  });

  it('defaults to "monogram" for invalid/unknown values', () => {
    expect(getShowStyle({ style: 'unknown-future-style' })).toBe('monogram');
  });

  it('defaults to "monogram" for null / undefined / empty show', () => {
    expect(getShowStyle(null)).toBe('monogram');
    expect(getShowStyle(undefined)).toBe('monogram');
    expect(getShowStyle({})).toBe('monogram');
    expect(getShowStyle({ style: null })).toBe('monogram');
  });
});

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

  it('returns "default" for any non-heritage value (shim — only heritage is special)', () => {
    expect(getShowLandingStyle({ landing_style: 'magazine' })).toBe('default');
    expect(getShowLandingStyle({ style: 'gazette' })).toBe('default');
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

  it('returns AKC for blank/whitespace registry_id (trim + default)', () => {
    expect(getTrialRegistry({ registry_id: '' })).toBe(akcRegistry);
    expect(getTrialRegistry({ registry_id: '   ' })).toBe(akcRegistry);
    expect(getTrialRegistry({ registry_id: ' AKC ' })).toBe(akcRegistry);
  });

  it('resolves a configured non-AKC registry (UKC)', () => {
    expect(getTrialRegistry({ registry_id: 'UKC' })).toBe(ukcRegistry);
    expect(getTrialRegistry({ registry_id: ' UKC ' })).toBe(ukcRegistry);
  });

  it('resolves ASCA', () => {
    expect(getTrialRegistry({ registry_id: 'ASCA' })).toBe(ascaRegistry);
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

  // The mapped domain Trial (trial.types.ts) carries the registry as camelCase `registryId`,
  // not snake_case — this is the shape the landing hooks pass. Without this path every styled
  // landing would silently fall back to AKC even for a UKC/ASCA trial.
  describe('camelCase registryId (mapped domain Trial)', () => {
    it('resolves UKC / ASCA from the camelCase field', () => {
      expect(getTrialRegistry({ registryId: 'UKC' })).toBe(ukcRegistry);
      expect(getTrialRegistry({ registryId: 'ASCA' })).toBe(ascaRegistry);
      expect(getTrialRegistry({ registryId: ' UKC ' })).toBe(ukcRegistry);
    });

    it('falls back to AKC for null/blank camelCase registryId', () => {
      expect(getTrialRegistry({ registryId: null })).toBe(akcRegistry);
      expect(getTrialRegistry({ registryId: '   ' })).toBe(akcRegistry);
    });

    it('prefers snake_case registry_id when both are present (raw row wins)', () => {
      expect(getTrialRegistry({ registry_id: 'UKC', registryId: 'ASCA' })).toBe(ukcRegistry);
    });

    it('falls through to camelCase when snake_case is null (mapped-row shape)', () => {
      expect(getTrialRegistry({ registry_id: null, registryId: 'ASCA' })).toBe(ascaRegistry);
    });
  });
});

describe('deriveRegistryId', () => {
  // The org→registry rule: registry_id is the validated, config-backed projection of
  // the show's organization (the write side; getTrialRegistry is the read side).
  it('passes through a configured registry organization', () => {
    expect(deriveRegistryId('AKC')).toBe('AKC');
    expect(deriveRegistryId('UKC')).toBe('UKC');
    expect(deriveRegistryId('ASCA')).toBe('ASCA');
  });

  it('falls back to AKC for organizations with no registry config', () => {
    // Bodies in the org dropdown that have no rulebook config yet.
    expect(deriveRegistryId('NACSW')).toBe('AKC');
    expect(deriveRegistryId('NADAC')).toBe('AKC');
    expect(deriveRegistryId('Other')).toBe('AKC');
  });

  it('falls back to AKC for null/undefined/blank organization', () => {
    expect(deriveRegistryId(null)).toBe('AKC');
    expect(deriveRegistryId(undefined)).toBe('AKC');
    expect(deriveRegistryId('')).toBe('AKC');
    expect(deriveRegistryId('   ')).toBe('AKC');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(deriveRegistryId(' UKC ')).toBe('UKC');
  });

  it('is case-sensitive (organization values are canonical upper-case)', () => {
    // The org dropdown stores canonical 'UKC'; a lowercase value is not a configured
    // registry id, so it safely falls back rather than silently matching.
    expect(deriveRegistryId('ukc')).toBe('AKC');
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
