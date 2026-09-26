import { describe, it, expect } from 'vitest';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { accountTargets, selectedEmails } from './bulkAccountTargets';

function person(
  id: string,
  patch: {
    status?: 'active' | 'suspended';
    deletedAt?: Date;
    email?: string;
    lastSignInAt?: string | null;
    user_id?: string;
  } = {}
): SelectedUser {
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

const ids = (items: SelectedUser[]) => items.map(item => item.id);

describe('accountTargets', () => {
  const selection = [
    person('active-new'),
    person('active-signed', { lastSignInAt: '2026-09-01T00:00:00Z' }),
    person('suspended', { status: 'suspended' }),
    person('removed', { deletedAt: new Date(), status: 'suspended' }),
    person('no-email', { email: '' }),
    person('me', { user_id: 'auth-me' }),
  ];

  it('suspends active, live people — never the admin themself', () => {
    const t = accountTargets(selection, 'auth-me');
    expect(ids(t.suspend)).toEqual(['active-new', 'active-signed', 'no-email']);
    expect(t.selfSkipped).toBe(true);
  });

  it('matches the admin by people id as well as auth id', () => {
    expect(accountTargets([person('me')], 'me')).toMatchObject({ suspend: [], selfSkipped: true });
  });

  it('reinstates only suspended live people; restores only removed people', () => {
    const t = accountTargets(selection, 'auth-me');
    expect(ids(t.reinstate)).toEqual(['suspended']);
    expect(ids(t.restore)).toEqual(['removed']);
  });

  it('invites only live people with an email who have never signed in', () => {
    const t = accountTargets(selection, 'auth-me');
    // "me" has never signed in in this fixture, so is included: an invitation
    // to yourself is harmless, unlike suspending yourself.
    expect(ids(t.invite)).toEqual(['active-new', 'suspended', 'me']);
  });

  it('reports no self-skip when the admin is not selected', () => {
    expect(accountTargets([person('a')], 'someone-else').selfSkipped).toBe(false);
  });
});

describe('selectedEmails', () => {
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
