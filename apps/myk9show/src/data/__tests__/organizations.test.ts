import { describe, it, expect } from 'vitest';

import { listRegistries } from '@/features/registries';
import { SHOW_ORGANIZATIONS, ONBOARDING_ORGANIZATIONS } from '../organizations';

const UNSUPPORTED = ['NACSW', 'CPE', 'USDAA', 'NADAC', 'NASDA', 'Other'];

/**
 * Two audiences, two lists. Show creation may only offer bodies the class
 * generator can run; the club onboarding *lead* form must still let an
 * unsupported club raise its hand (docs/audits/2026-07-01-show-creation-wizard-ux.md §4,
 * and the "let us know through the club onboarding form" FAQ in src/data/faqs.ts).
 */
describe('SHOW_ORGANIZATIONS (show-creation wizard)', () => {
  it('offers exactly the configured registries — no more, no less', () => {
    const values = SHOW_ORGANIZATIONS.map(o => o.value).sort();
    expect(values).toEqual([...listRegistries()].sort());
  });

  it('excludes every unsupported body', () => {
    const values = SHOW_ORGANIZATIONS.map(o => o.value);
    for (const dead of UNSUPPORTED) {
      expect(values).not.toContain(dead);
    }
  });

  it('labels options as "<id> (<full name>)"', () => {
    expect(SHOW_ORGANIZATIONS).toContainEqual({
      value: 'AKC',
      label: 'AKC (American Kennel Club)',
    });
  });
});

describe('ONBOARDING_ORGANIZATIONS (club onboarding lead form)', () => {
  it('is a superset of the configured registries', () => {
    const onboarding = new Set(ONBOARDING_ORGANIZATIONS.map(o => o.value));
    for (const org of SHOW_ORGANIZATIONS.map(o => o.value)) {
      expect(onboarding.has(org)).toBe(true);
    }
  });

  it('still offers unsupported bodies + the "Other" escape hatch', () => {
    const values = ONBOARDING_ORGANIZATIONS.map(o => o.value);
    for (const org of UNSUPPORTED) {
      expect(values).toContain(org);
    }
  });

  it('has no duplicate values', () => {
    const values = ONBOARDING_ORGANIZATIONS.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
