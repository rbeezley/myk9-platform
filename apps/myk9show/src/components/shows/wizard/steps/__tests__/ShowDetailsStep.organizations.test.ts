import { describe, it, expect } from 'vitest';

import { listRegistries } from '@/features/registries';
import { ORGANIZATIONS } from '../ShowDetailsStep.types';

/**
 * The Organization dropdown must offer only sanctioning bodies with a real
 * rulebook config. Picking a body the app can't run dead-ends the secretary at
 * an empty class-selection step
 * (docs/audits/2026-07-01-show-creation-wizard-ux.md §4).
 */
describe('ORGANIZATIONS dropdown options', () => {
  it('offers exactly the configured registries — no more, no less', () => {
    const values = ORGANIZATIONS.map(o => o.value).sort();
    const configured = [...listRegistries()].sort();
    expect(values).toEqual(configured);
  });

  it('excludes sanctioning bodies with no rulebook config', () => {
    const values = ORGANIZATIONS.map(o => o.value);
    for (const dead of ['NACSW', 'CPE', 'USDAA', 'NADAC', 'NASDA', 'Other']) {
      expect(values).not.toContain(dead);
    }
  });

  it('labels every option as "<id> (<full name>)"', () => {
    expect(ORGANIZATIONS).toContainEqual({
      value: 'AKC',
      label: 'AKC (American Kennel Club)',
    });
    expect(ORGANIZATIONS).toContainEqual({
      value: 'UKC',
      label: 'UKC (United Kennel Club)',
    });
  });
});
