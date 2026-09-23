import { describe, expect, it } from 'vitest';
import { canChangeShowOrganization } from '../ShowDetailsStep.helpers';

describe('canChangeShowOrganization', () => {
  it.each(['add-trials', 'add-classes'] as const)(
    'locks the organization in persisted-show mode %s regardless of selected class count',
    mode => {
      expect(canChangeShowOrganization({ mode, selectedClassCount: 0 })).toBe(false);
      expect(canChangeShowOrganization({ mode, selectedClassCount: 1 })).toBe(false);
    }
  );

  it('allows a failed clone with an intact zero-class draft to change organization', () => {
    // Clone failure is UI state only; the intact draft remains in create mode.
    expect(canChangeShowOrganization({ mode: 'create', selectedClassCount: 0 })).toBe(true);
  });

  it('requires a fresh show to clear selected classes before changing organization', () => {
    expect(canChangeShowOrganization({ mode: 'create', selectedClassCount: 1 })).toBe(false);
  });

  it('uses selected classes, not clone status, as the create-mode constraint', () => {
    expect(canChangeShowOrganization({ mode: 'clone', selectedClassCount: 0 })).toBe(true);
    expect(canChangeShowOrganization({ mode: 'clone', selectedClassCount: 1 })).toBe(false);
  });
});
