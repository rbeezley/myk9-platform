import { describe, expect, it } from 'vitest';

import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import { listShowAccess } from '../diagnostics/accessDiagnostics';
import type { ToolContext } from '../tools/index';

const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

const SHOW_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const CLUB_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

type QueryResult = { data: unknown; error: unknown };

interface MockSpec {
  show: QueryResult;
  userRoles?: QueryResult[];
  clubMembers?: QueryResult;
  queryCalls?: Array<{ table: string; method: 'eq' | 'in'; args: unknown[] }>;
}

/**
 * Minimal chainable Supabase fake. `shows` resolves via maybeSingle(); each
 * `user_roles` query (show-scoped, then club-scoped) resolves the next entry of
 * `userRoles` when awaited.
 */
function makeCtx(spec: MockSpec): ToolContext {
  let urIndex = 0;
  const supabase = {
    from(table: string) {
      if (table === 'shows') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(spec.show),
            }),
          }),
        };
      }
      if (table === 'club_members') {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.in = chain;
        builder.limit = chain;
        builder.then = (
          resolve: (value: QueryResult) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve(spec.clubMembers ?? { data: [], error: null }).then(resolve, reject);
        return builder;
      }
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = (...args: unknown[]) => {
        spec.queryCalls?.push({ table, method: 'eq', args });
        return builder;
      };
      builder.neq = chain;
      builder.in = (...args: unknown[]) => {
        spec.queryCalls?.push({ table, method: 'in', args });
        return builder;
      };
      builder.is = chain;
      builder.not = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.returns = chain;
      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown
      ) => {
        const result = (spec.userRoles ?? [])[urIndex] ?? { data: [], error: null };
        urIndex += 1;
        return Promise.resolve(result).then(resolve, reject);
      };
      return builder;
    },
  };
  return { config: CONFIG, supabase: supabase as unknown as AdminSupabaseClient };
}

function grant(overrides: Record<string, unknown>) {
  return {
    id: `grant-${Math.random()}`,
    is_active: true,
    expires_at: null,
    show_id: SHOW_ID,
    club_id: null,
    auth_user_id: 'auth-user-id',
    user_id: 'person-id',
    role: { name: 'secretary' },
    person: { first_name: 'Pat', last_name: 'Lee', email: 'pat@example.com' },
    ...overrides,
  };
}

describe('listShowAccess', () => {
  it('returns not_found when the show does not exist', async () => {
    const ctx = makeCtx({ show: { data: null, error: null } });
    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    expect(result.state).toBe('not_found');
  });

  it('returns source_unavailable when the show query errors', async () => {
    const ctx = makeCtx({ show: { data: null, error: { code: 'PGRST' } } });
    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    expect(result.state).toBe('source_unavailable');
  });

  it('returns every current policy role, including global site admins', async () => {
    const queryCalls: NonNullable<MockSpec['queryCalls']> = [];
    const ctx = makeCtx({
      show: { data: { id: SHOW_ID, name: 'Spring Trial', club_id: CLUB_ID }, error: null },
      queryCalls,
      userRoles: [
        {
          data: [
            grant({ id: 'a', role: { name: 'secretary' }, show_id: SHOW_ID }),
            grant({ id: 'chair', role: { name: 'chairman' }, show_id: SHOW_ID }),
            grant({ id: 'steward', role: { name: 'steward' }, show_id: SHOW_ID }),
          ],
          error: null,
        },
        {
          data: [
            grant({
              id: 'b',
              role: { name: 'club_admin' },
              show_id: null,
              club_id: CLUB_ID,
              person: { first_name: 'Dana', last_name: 'Roe', email: 'dana@club.org' },
            }),
          ],
          error: null,
        },
        {
          data: [
            grant({
              id: 'site-admin',
              role: { name: 'site_admin' },
              show_id: null,
              club_id: null,
            }),
          ],
          error: null,
        },
      ],
    });

    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    expect(result.state).toBe('found');
    expect(result.summary).toMatchObject({
      totalGrants: 5,
      activeGrants: 5,
      hasScopedSecretary: true,
    });
    // Club-scoped club_admin is included even though show_id is null.
    expect(result.evidence.map(e => e.label)).toEqual(
      expect.arrayContaining([
        'secretary (show-scoped)',
        'chairman (show-scoped)',
        'steward (show-scoped)',
        'club_admin (club-scoped)',
        'site_admin (global)',
      ])
    );
    // Emails are masked.
    expect(result.evidence[0]?.value).toContain('p***@example.com');
    expect(result.evidence[1]?.value).toContain('d***@club.org');
    expect(result.limitations).toHaveLength(0);
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        { table: 'user_roles', method: 'in', args: ['role.name', expect.any(Array)] },
        { table: 'user_roles', method: 'eq', args: ['role.name', 'site_admin'] },
      ])
    );
  });

  it('does not report club-scoped secretary access without active membership', async () => {
    const ctx = makeCtx({
      show: { data: { id: SHOW_ID, name: 'Spring Trial', club_id: CLUB_ID }, error: null },
      userRoles: [
        { data: [], error: null },
        {
          data: [
            grant({
              id: 'club-secretary',
              role: { name: 'secretary' },
              show_id: null,
              club_id: CLUB_ID,
            }),
          ],
          error: null,
        },
        { data: [], error: null },
      ],
      clubMembers: { data: [], error: null },
    });

    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    expect(result.summary).toMatchObject({ activeGrants: 0, hasScopedSecretary: false });
    expect(String(result.evidence[0]?.value)).toContain('membership_inactive');
  });

  it('notes grants for the same club that are scoped to a different show', async () => {
    const ctx = makeCtx({
      show: { data: { id: SHOW_ID, name: 'Spring Trial', club_id: CLUB_ID }, error: null },
      userRoles: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [{ id: 'other-show-grant' }], error: null },
      ],
    });

    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    expect(result.limitations.join(' ')).toContain('different show');
  });

  it('labels inactive and expired grants instead of omitting them', async () => {
    const ctx = makeCtx({
      show: { data: { id: SHOW_ID, name: 'Spring Trial', club_id: null }, error: null },
      userRoles: [
        {
          data: [
            grant({ id: 'inactive', role: { name: 'chairman' }, is_active: false }),
            grant({
              id: 'expired',
              role: { name: 'secretary' },
              expires_at: '2000-01-01T00:00:00Z',
            }),
          ],
          error: null,
        },
      ],
    });

    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    const values = result.evidence.map(e => String(e.value));
    expect(values.some(v => v.endsWith('inactive'))).toBe(true);
    expect(values.some(v => v.endsWith('expired'))).toBe(true);
    expect(values.some(v => v.includes(`showId=${SHOW_ID}`))).toBe(true);
    expect(values.some(v => v.includes('expiresAt=2000-01-01T00:00:00Z'))).toBe(true);
    // No active secretary-like role → limitation present.
    expect(result.summary).toMatchObject({ hasScopedSecretary: false });
    expect(result.limitations.join(' ')).toContain('secretary');
  });
});
