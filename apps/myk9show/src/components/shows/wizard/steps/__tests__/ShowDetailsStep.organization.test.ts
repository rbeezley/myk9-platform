import { describe, expect, it } from 'vitest';
import { canChangeShowOrganization } from '../ShowDetailsStep.helpers';

describe('canChangeShowOrganization', () => {
  it.each(['add-trials', 'add-classes'] as const)(
    'locks the organization in persisted-show mode %s regardless of loaded class count',
    mode => {
      expect(canChangeShowOrganization({ mode, cloneStatus: 'idle', selectedClassCount: 0 })).toBe(
        false
      );
      expect(canChangeShowOrganization({ mode, cloneStatus: 'ready', selectedClassCount: 0 })).toBe(
        false
      );
    }
  );

  it('allows a fresh show to choose an organization', () => {
    expect(
      canChangeShowOrganization({ mode: 'create', cloneStatus: 'idle', selectedClassCount: 0 })
    ).toBe(true);
  });

  it('requires a fresh show to clear selected classes before changing organization', () => {
    expect(
      canChangeShowOrganization({ mode: 'create', cloneStatus: 'idle', selectedClassCount: 1 })
    ).toBe(false);
  });

  it.each(['idle', 'hydrating', 'failed'] as const)(
    'blocks changing organization while clone hydration is %s',
    cloneStatus => {
      expect(canChangeShowOrganization({ mode: 'clone', cloneStatus, selectedClassCount: 0 })).toBe(
        false
      );
    }
  );

  it('allows a ready clone to change organization only after all selected classes are cleared', () => {
    expect(
      canChangeShowOrganization({ mode: 'clone', cloneStatus: 'ready', selectedClassCount: 0 })
    ).toBe(true);
    expect(
      canChangeShowOrganization({ mode: 'clone', cloneStatus: 'ready', selectedClassCount: 1 })
    ).toBe(false);
  });
});
