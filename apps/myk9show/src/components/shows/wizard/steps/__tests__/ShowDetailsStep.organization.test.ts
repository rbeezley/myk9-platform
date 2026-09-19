import { describe, expect, it } from 'vitest';
import { canChangeClonedOrganization } from '../ShowDetailsStep.helpers';

describe('cloned show organization changes', () => {
  it('blocks a registry change while cloned classes remain and allows it after they are cleared', () => {
    const clonedTrials = [{ classes: [{ element: 'Container', level: 'Novice', section: 'A' }] }];

    expect(canChangeClonedOrganization('AKC', 'UKC', clonedTrials)).toBe(false);
    expect(canChangeClonedOrganization('AKC', 'UKC', [{ classes: [] }])).toBe(true);
  });
});
