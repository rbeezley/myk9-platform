import { describe, expect, it } from 'vitest';

import {
  CANONICAL_SCOPE_CLUB_ID,
  planAccountProvisioning,
  planRoleReconciliation,
  resolveEffectiveSetupMode,
  resolveScopedClubId,
  resolveSetupMode,
} from './setup-e2e-test-users.helpers';

describe('resolveScopedClubId', () => {
  const heartland = { id: CANONICAL_SCOPE_CLUB_ID, createdAt: '2026-06-17T00:00:00Z' };
  const prairie = { id: 'dededede-0000-0000-0000-000000000002', createdAt: '2026-06-17T00:00:00Z' };

  it('picks Heartland regardless of the order the rows arrive in', () => {
    // Both clubs are inserted by one statement, so created_at ties and the row
    // order is whatever Postgres returns. Neither ordering may change the answer.
    expect(resolveScopedClubId([heartland, prairie])).toBe(CANONICAL_SCOPE_CLUB_ID);
    expect(resolveScopedClubId([prairie, heartland])).toBe(CANONICAL_SCOPE_CLUB_ID);
  });

  it('falls back to the oldest club when Heartland is absent', () => {
    expect(
      resolveScopedClubId([
        { id: 'club-newer', createdAt: '2026-07-01T00:00:00Z' },
        { id: 'club-older', createdAt: '2026-01-01T00:00:00Z' },
      ])
    ).toBe('club-older');
  });

  it('breaks a created_at tie by id so the fallback is deterministic too', () => {
    const tied = [
      { id: 'club-b', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'club-a', createdAt: '2026-01-01T00:00:00Z' },
    ];
    expect(resolveScopedClubId(tied)).toBe('club-a');
    expect(resolveScopedClubId([...tied].reverse())).toBe('club-a');
  });

  it('treats a null created_at as oldest rather than throwing', () => {
    expect(
      resolveScopedClubId([
        { id: 'club-dated', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'club-undated', createdAt: null },
      ])
    ).toBe('club-undated');
  });

  it('throws when there is no club at all', () => {
    expect(() => resolveScopedClubId([])).toThrow(/none found/);
  });
});

describe('planAccountProvisioning', () => {
  const required = { email: 'e2e-admin@test.myk9.com', passwordEnv: 'E2E_ADMIN_PASSWORD' };
  const optional = {
    email: 'e2e-club-admin@test.myk9.com',
    passwordEnv: 'E2E_CLUB_ADMIN_PASSWORD',
    optional: true,
  };

  it('skips an optional account with no password instead of failing the run', () => {
    const plan = planAccountProvisioning([required, optional], {
      E2E_ADMIN_PASSWORD: 'admin-pw',
    });

    expect(plan.provision).toEqual([required]);
    expect(plan.skipped).toEqual([optional]);
    expect(plan.missingRequired).toEqual([]);
  });

  it('provisions an optional account once its password is configured', () => {
    const plan = planAccountProvisioning([required, optional], {
      E2E_ADMIN_PASSWORD: 'admin-pw',
      E2E_CLUB_ADMIN_PASSWORD: 'club-admin-pw',
    });

    expect(plan.provision).toEqual([required, optional]);
    expect(plan.skipped).toEqual([]);
  });

  it('still reports a required account with no password', () => {
    // The F1 regression this guard exists for: a canonical account that silently
    // never gets provisioned 403s the golden path it owns.
    const plan = planAccountProvisioning([required, optional], {});

    expect(plan.missingRequired).toEqual([required]);
    expect(plan.provision).toEqual([]);
  });

  it('treats an empty-string password as missing', () => {
    const plan = planAccountProvisioning([required], { E2E_ADMIN_PASSWORD: '' });
    expect(plan.missingRequired).toEqual([required]);
  });
});

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
