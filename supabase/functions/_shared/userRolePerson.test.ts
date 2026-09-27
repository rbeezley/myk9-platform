// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { describe, expect, it } from 'vitest';

import { getShowStaffRecipientIds } from '../push-trigger-chat-message/recipients';
import { getSiteAdminRecipients } from '../push-trigger-support-message/recipients';
import { createPostgrestFake, findAmbiguousEmbed } from './testing/postgrestFake';
import { USER_ROLE_HOLDER_EMBED } from './userRolePerson';

// MYK9-726: user_roles has two FKs to people (user_id, granted_by), so an
// unhinted people(...) embed fails the whole request with PGRST201 on live.

describe('postgrest fake ambiguity rule (known answers)', () => {
  it.each([
    'people!inner(auth_user_id), roles!inner(name)',
    'id, people(auth_user_id)',
    'person:people(email)',
    'person:people!inner(email)',
  ])('rejects the unhinted embed %s', select => {
    expect(findAmbiguousEmbed('user_roles', select)).toBe('people');
  });

  it.each([
    `${USER_ROLE_HOLDER_EMBED}!inner(auth_user_id), roles!inner(name)`,
    'person:people!user_id(email)',
    'roles!inner(name)',
  ])('accepts %s', select => {
    expect(findAmbiguousEmbed('user_roles', select)).toBeNull();
  });

  it('does not flag the same embed from a table with one FK to people', () => {
    expect(findAmbiguousEmbed('entries', 'handler:people(first_name)')).toBeNull();
  });
});

describe('user_roles → people recipient queries name the holder FK', () => {
  it('support-message site-admin recipients resolve instead of failing PGRST201', async () => {
    const fake = createPostgrestFake({
      user_roles: [
        {
          people: {
            auth_user_id: 'admin-auth',
            email: 'admin@example.test',
            first_name: 'Sam',
            last_name: 'Admin',
          },
          roles: { name: 'site_admin' },
        },
      ],
    });

    const recipients = await getSiteAdminRecipients(fake as unknown as SupabaseClient);

    expect(recipients).toEqual([
      { authUserId: 'admin-auth', email: 'admin@example.test', name: 'Sam Admin' },
    ]);
    expect(fake.selects.map(s => s.select).join(' ')).toContain(USER_ROLE_HOLDER_EMBED);
  });

  it('chat-message staff recipients resolve instead of failing PGRST201', async () => {
    const fake = createPostgrestFake({
      user_roles: [
        { id: 'r1', club_id: 'club-1', people: { auth_user_id: 'sec-auth' } },
        { id: 'r2', club_id: 'club-1', people: { auth_user_id: 'sec-auth' } },
      ],
    });

    const ids = await getShowStaffRecipientIds(fake as unknown as SupabaseClient, 'club-1');

    expect(ids).toEqual(['sec-auth']);
    const userRoleSelects = fake.selects.filter(s => s.table === 'user_roles');
    expect(userRoleSelects).toHaveLength(1);
    for (const { select } of userRoleSelects) {
      expect(select).toContain(USER_ROLE_HOLDER_EMBED);
    }
  });

  // MYK9-759 (owner decision 2026-09-26): an exhibitor's show message pushes to
  // the club's secretaries only. Site admins are deliberately not an audience.
  it('chat-message staff audience is the club secretaries and no other role', async () => {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    const recording = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'not', 'or', 'is', 'gt']) {
          builder[method] = (...args: unknown[]) => {
            calls.push({ table, method, args });
            return builder;
          };
        }
        builder.then = (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled);
        return builder;
      },
    };

    await getShowStaffRecipientIds(recording as unknown as SupabaseClient, 'club-1');

    const roleFilters = calls.filter(c => c.args[0] === 'roles.name');
    expect(roleFilters).toEqual([
      { table: 'user_roles', method: 'in', args: ['roles.name', ['secretary', 'trial_secretary']] },
    ]);
    expect(calls.filter(c => c.method === 'select')).toHaveLength(1);
  });

  it('a failed user_roles query still aborts the fanout (fail closed)', async () => {
    const failing = {
      from: () => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'not', 'or']) builder[method] = () => builder;
        builder.then = (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(
            onFulfilled
          );
        return builder;
      },
    };

    await expect(
      getShowStaffRecipientIds(failing as unknown as SupabaseClient, 'club-1')
    ).rejects.toThrow('Audience resolution failed');
    await expect(getSiteAdminRecipients(failing as unknown as SupabaseClient)).rejects.toThrow(
      'Audience resolution failed'
    );
  });
});
