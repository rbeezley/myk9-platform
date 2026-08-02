import { describe, expect, it } from 'vitest';

import {
  planRoleReconciliation,
  resolveEffectiveSetupMode,
  resolveSetupMode,
} from './setup-e2e-test-users.helpers';

describe('planRoleReconciliation', () => {
  it('deactivates stale grants, reactivates declared grants, and inserts missing grants', () => {
    const plan = planRoleReconciliation(
      [
        {
          id: 'stale-secretary',
          roleId: 'secretary',
          clubId: null,
          showId: null,
          isActive: true,
        },
        {
          id: 'inactive-judge',
          roleId: 'judge',
          clubId: null,
          showId: null,
          isActive: false,
        },
        {
          id: 'wrong-scope-judge',
          roleId: 'judge',
          clubId: 'heartland',
          showId: null,
          isActive: true,
        },
      ],
      [
        { roleId: 'judge', clubId: null, showId: null },
        { roleId: 'steward', clubId: null, showId: null },
      ]
    );

    expect(plan).toEqual({
      deactivateIds: ['stale-secretary', 'wrong-scope-judge'],
      reactivateIds: ['inactive-judge'],
      insert: [{ roleId: 'steward', clubId: null, showId: null }],
    });
  });
});

describe('resolveSetupMode', () => {
  it('requires exactly one explicit preview or apply flag', () => {
    expect(resolveSetupMode(['--dry-run'])).toBe('preview');
    expect(resolveSetupMode(['--apply'])).toBe('apply');
    expect(() => resolveSetupMode([])).toThrow(/exactly one/i);
    expect(() => resolveSetupMode(['--dry-run', '--apply'])).toThrow(/exactly one/i);
  });

  it('lets an explicit dry-run override auth-only apply mode', () => {
    expect(resolveEffectiveSetupMode(['--dry-run'], true)).toBe('preview');
    expect(resolveEffectiveSetupMode([], true)).toBe('apply');
    expect(() => resolveEffectiveSetupMode(['--dry-run', '--apply'], true)).toThrow(/exactly one/i);
  });
});
