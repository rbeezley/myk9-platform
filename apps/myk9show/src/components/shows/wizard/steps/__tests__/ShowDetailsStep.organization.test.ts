import { describe, expect, it } from 'vitest';
import {
  canChangeClonedOrganization,
  reconcileTrialTypeForOrganization,
} from '../ShowDetailsStep.helpers';

describe('cloned show organization changes', () => {
  it('blocks a registry change while cloned classes remain and allows it after they are cleared', () => {
    const clonedTrials = [{ classes: [{ element: 'Container', level: 'Novice', section: 'A' }] }];

    expect(canChangeClonedOrganization('AKC', 'UKC', clonedTrials)).toBe(false);
    expect(canChangeClonedOrganization('AKC', 'UKC', [{ classes: [] }])).toBe(true);
  });

  it('blocks an organization change while clone classes are still hydrating', () => {
    expect(
      canChangeClonedOrganization('AKC', 'UKC', [{ classes: [] }], {
        cloneHydrationInProgress: true,
      })
    ).toBe(false);
  });

  it('reconciles stale trial types to the new organization after classes are cleared', () => {
    expect(reconcileTrialTypeForOrganization('UKC', 'Scent Work')).toBe('Nosework');
    expect(reconcileTrialTypeForOrganization('UKC', 'Agility')).toBe('Agility');
    expect(reconcileTrialTypeForOrganization('UKC', 'SCENT_WORK')).toBe('Nosework');
  });
});
