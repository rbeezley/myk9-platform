import { describe, it, expect, beforeEach, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  captureMessage: sentryMocks.captureMessage,
}));

import { getShowStyle, getTrialRegistry, getTrialTimezone, deriveRegistryId } from '../helpers';
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
  beforeEach(() => {
    sentryMocks.captureMessage.mockClear();
  });

  it('returns the trial timezone when set to a valid IANA zone', () => {
    expect(getTrialTimezone({ timezone: 'America/Chicago' })).toBe('America/Chicago');
  });

  it('does not report a valid timezone to Sentry', () => {
    getTrialTimezone({ timezone: 'America/Chicago' });
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it('falls back to America/New_York when missing', () => {
    expect(getTrialTimezone({ timezone: null })).toBe('America/New_York');
    expect(getTrialTimezone({})).toBe('America/New_York');
    expect(getTrialTimezone(undefined)).toBe('America/New_York');
    expect(getTrialTimezone({ timezone: '' })).toBe('America/New_York');
  });

  it('does not report a missing/empty timezone to Sentry (not an invalid value)', () => {
    getTrialTimezone({ timezone: null });
    getTrialTimezone({});
    getTrialTimezone({ timezone: '' });
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  // Each test below uses its own unique rejected-value string. The dedupe Set
  // that backs "once per session" reporting is module-level and persists for
  // the life of the test file, so reusing a value across tests would make a
  // later test see zero calls simply because an earlier test already
  // reported it — that's the memoization working as designed, not a bug, but
  // it means test values must not collide with each other.
  it('falls back to America/New_York for an unresolvable IANA zone', () => {
    expect(getTrialTimezone({ timezone: 'America/Nowhere-1' })).toBe('America/New_York');
  });

  it('never returns a string that makes Intl throw', () => {
    const result = getTrialTimezone({ timezone: 'Not/AZone-1' });
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: result })).not.toThrow();
  });

  it('reports an invalid timezone to Sentry with the trial id and rejected value', () => {
    getTrialTimezone({ id: 'trial-1', timezone: 'America/Nowhere-2' });
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
    const [message, options] = sentryMocks.captureMessage.mock.calls[0];
    expect(message).toEqual(expect.stringContaining('America/Nowhere-2'));
    expect(options).toMatchObject({
      extra: expect.objectContaining({
        trialId: 'trial-1',
        rejectedTimezone: 'America/Nowhere-2',
      }),
    });
  });

  it('reports a given invalid value only once per session, not per render', () => {
    getTrialTimezone({ id: 'trial-1', timezone: 'America/Nowhere-3' });
    getTrialTimezone({ id: 'trial-1', timezone: 'America/Nowhere-3' });
    getTrialTimezone({ id: 'trial-2', timezone: 'America/Nowhere-3' });
    expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
  });
});
