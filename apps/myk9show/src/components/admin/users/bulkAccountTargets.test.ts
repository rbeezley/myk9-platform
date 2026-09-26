import { describe, it, expect } from 'vitest';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { accountTargets, isEligible, nameOf, selectedEmails } from './bulkAccountTargets';

function user(id: string, patch: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    email: `${id}@example.com`,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignInAt: null,
    status: 'active',
    ...patch,
  } as AdminUser;
}

function rosterOf(...users: AdminUser[]): Map<string, AdminUser> {
  return new Map(users.map(u => [u.id, u]));
}

describe('accountTargets', () => {
  const roster = rosterOf(
    user('active-new'),
    user('active-signed', { lastSignInAt: '2026-09-01T00:00:00Z' }),
    user('suspended', { status: 'suspended' }),
    user('removed', { deletedAt: new Date().toISOString(), status: 'suspended' }),
    user('no-email', { email: '' }),
    user('me', { user_id: 'auth-me' })
  );
  const selectedIds = [...roster.keys()];

  it('suspends active, live people — never the admin themself', () => {
    const t = accountTargets(selectedIds, roster, 'auth-me');
    expect(t.suspend).toEqual(['active-new', 'active-signed', 'no-email']);
    expect(t.selfSkipped).toBe(true);
  });

  it('matches the admin by people id as well as auth id', () => {
    expect(accountTargets(['me'], roster, 'me')).toMatchObject({ suspend: [], selfSkipped: true });
  });

  it('reinstates only suspended live people; restores only removed people', () => {
    const t = accountTargets(selectedIds, roster, 'auth-me');
    expect(t.reinstate).toEqual(['suspended']);
    expect(t.restore).toEqual(['removed']);
  });

  it('invites only live people with an email who have never signed in', () => {
    const t = accountTargets(selectedIds, roster, 'auth-me');
    expect(t.invite).toEqual(['active-new', 'suspended', 'me']);
  });

  it('reports no self-skip when the admin is not selected', () => {
    expect(accountTargets(['a'], rosterOf(user('a')), 'someone-else').selfSkipped).toBe(false);
  });

  it('skips an id that has left the roster entirely, for every action', () => {
    const t = accountTargets(['ghost'], roster, 'auth-me');
    expect(t).toMatchObject({ suspend: [], reinstate: [], invite: [], restore: [] });
  });

  // MYK9-835: a status change or a sign-in that lands AFTER selection must be
  // visible the next time these rules are asked, without recomputing anything
  // upstream — the same roster map, read again, is enough.
  it('reflects a status change made to the SAME roster map object between two calls', () => {
    const live = rosterOf(user('a'));
    expect(accountTargets(['a'], live, null).suspend).toEqual(['a']);
    live.set('a', { ...live.get('a')!, status: 'suspended' });
    expect(accountTargets(['a'], live, null).suspend).toEqual([]);
    expect(accountTargets(['a'], live, null).reinstate).toEqual(['a']);
  });

  it('reflects a sign-in that lands after selection: invite eligibility drops', () => {
    const live = rosterOf(user('a'));
    expect(isEligible('invite', 'a', live, null)).toBe(true);
    live.set('a', { ...live.get('a')!, lastSignInAt: '2026-09-26T00:00:00Z' });
    expect(isEligible('invite', 'a', live, null)).toBe(false);
  });
});

describe('nameOf', () => {
  it('reads the CURRENT name from the roster, not a stale snapshot', () => {
    const roster = rosterOf(user('a', { firstName: 'Ann', lastName: 'Old' }));
    expect(nameOf('a', roster)).toBe('Ann Old');
    roster.set('a', { ...roster.get('a')!, lastName: 'New' });
    expect(nameOf('a', roster)).toBe('Ann New');
  });

  it('falls back to the id when the person has left the roster', () => {
    expect(nameOf('gone', new Map())).toBe('gone');
  });
});

describe('selectedEmails', () => {
  function person(id: string, patch: { email?: string } = {}): SelectedUser {
    return {
      id,
      user: {
        id,
        firstName: id,
        lastName: 'Test',
        email: patch.email ?? `${id}@example.com`,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignInAt: null,
        ...patch,
      },
    } as SelectedUser;
  }

  it('returns unique, trimmed, non-empty addresses in selection order', () => {
    expect(
      selectedEmails([
        person('a', { email: ' a@example.com ' }),
        person('b', { email: '' }),
        person('c', { email: 'a@example.com' }),
        person('d'),
      ])
    ).toEqual(['a@example.com', 'd@example.com']);
  });
});
