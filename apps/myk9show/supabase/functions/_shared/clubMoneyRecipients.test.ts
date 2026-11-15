import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadClubMoneyRecipients,
  resolveClubMoneyRecipients,
  type ClubAdminRoleRow,
} from './clubMoneyRecipients';

const NOW = new Date('2026-11-14T12:00:00Z');

afterEach(() => {
  vi.restoreAllMocks();
});

function admin(email: string | null, overrides: Partial<ClubAdminRoleRow> = {}): ClubAdminRoleRow {
  return {
    is_active: true,
    expires_at: null,
    people: { email, deleted_at: null, status: 'active' },
    ...overrides,
  };
}

describe('resolveClubMoneyRecipients', () => {
  it('two admins and a separate contact address are three recipients', () => {
    expect(
      resolveClubMoneyRecipients(
        'club@example.org',
        [admin('ann@example.org'), admin('bob@example.org')],
        NOW
      )
    ).toEqual(['ann@example.org', 'bob@example.org', 'club@example.org']);
  });

  it('a club whose only admin is the contact address is one recipient', () => {
    expect(
      resolveClubMoneyRecipients('club@example.org', [admin('club@example.org')], NOW)
    ).toEqual(['club@example.org']);
  });

  it('dedupes case-insensitively and ignores surrounding spaces', () => {
    expect(
      resolveClubMoneyRecipients(
        ' Club@Example.org ',
        [admin('CLUB@example.ORG'), admin('ann@example.org'), admin(' Ann@Example.org')],
        NOW
      )
    ).toEqual(['CLUB@example.ORG', 'ann@example.org']);
  });

  it('a deactivated admin receives nothing', () => {
    expect(
      resolveClubMoneyRecipients(
        'club@example.org',
        [admin('gone@example.org', { is_active: false }), admin('ann@example.org')],
        NOW
      )
    ).toEqual(['ann@example.org', 'club@example.org']);
  });

  it('an expired grant receives nothing; an unexpired one does', () => {
    expect(
      resolveClubMoneyRecipients(
        null,
        [
          admin('expired@example.org', { expires_at: '2026-11-13T00:00:00Z' }),
          admin('current@example.org', { expires_at: '2026-12-01T00:00:00Z' }),
        ],
        NOW
      )
    ).toEqual(['current@example.org']);
  });

  it('skips deleted or suspended people and admins with no email', () => {
    expect(
      resolveClubMoneyRecipients(
        'club@example.org',
        [
          admin(null),
          { ...admin('x'), people: { email: 'deleted@example.org', deleted_at: '2026-01-01' } },
          { ...admin('x'), people: { email: 'suspended@example.org', status: 'suspended' } },
          { ...admin('x'), people: null },
          { ...admin('x'), people: [{ email: 'array@example.org' }] },
        ],
        NOW
      )
    ).toEqual(['array@example.org', 'club@example.org']);
  });

  it('a club with no admins and no contact address has no recipients', () => {
    expect(resolveClubMoneyRecipients(null, [], NOW)).toEqual([]);
    expect(resolveClubMoneyRecipients('   ', [], NOW)).toEqual([]);
  });
});

function fakeClient(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => resolve(result),
  };
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, from, builder };
}

describe('loadClubMoneyRecipients', () => {
  it('reads the club admins of this club, by the holder FK, and merges the contact address', async () => {
    const { client, from, builder } = fakeClient({
      data: [admin('ann@example.org'), admin('old@example.org', { is_active: false })],
      error: null,
    });

    await expect(loadClubMoneyRecipients(client, 'club-1', 'club@example.org')).resolves.toEqual([
      'ann@example.org',
      'club@example.org',
    ]);
    expect(from).toHaveBeenCalledWith('user_roles');
    expect(builder.select).toHaveBeenCalledWith(
      'is_active, expires_at, people!user_roles_user_id_fkey(email, deleted_at, status), roles!inner(name)'
    );
    expect(builder.eq).toHaveBeenCalledWith('club_id', 'club-1');
    expect(builder.eq).toHaveBeenCalledWith('roles.name', 'club_admin');
  });

  it('falls back to the contact address when the admin lookup fails', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loadClubMoneyRecipients(client, 'club-1', 'club@example.org')).resolves.toEqual([
      'club@example.org',
    ]);
  });
});
