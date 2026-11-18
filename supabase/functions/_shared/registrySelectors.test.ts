// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_TRIAL_TIME_ZONE,
  selectTrialRegistryId,
  selectTrialTimeZone,
} from './registrySelectors.ts';

describe('selectTrialRegistryId', () => {
  const configured = ['AKC', 'UKC', 'ASCA'];
  it('reads blank as AKC, trims, and flags an unknown id', () => {
    expect(selectTrialRegistryId(null, configured)).toEqual({ id: 'AKC', known: true });
    expect(selectTrialRegistryId('  ', configured)).toEqual({ id: 'AKC', known: true });
    expect(selectTrialRegistryId(' UKC ', configured)).toEqual({ id: 'UKC', known: true });
    expect(selectTrialRegistryId('NACSW', configured)).toEqual({ id: 'NACSW', known: false });
  });
});

describe('selectTrialTimeZone', () => {
  it('keeps a valid zone and falls back to New York for blank or invalid', () => {
    expect(selectTrialTimeZone('America/Chicago')).toEqual({
      timeZone: 'America/Chicago',
      rejected: null,
    });
    expect(selectTrialTimeZone(null)).toEqual({
      timeZone: FALLBACK_TRIAL_TIME_ZONE,
      rejected: null,
    });
    expect(selectTrialTimeZone('Not/AZone')).toEqual({
      timeZone: FALLBACK_TRIAL_TIME_ZONE,
      rejected: 'Not/AZone',
    });
  });

  it('refuses a padded zone instead of trimming it', () => {
    expect(selectTrialTimeZone(' America/Chicago')).toEqual({
      timeZone: FALLBACK_TRIAL_TIME_ZONE,
      rejected: ' America/Chicago',
    });
  });
});
