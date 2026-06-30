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
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.returns = chain;
      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown,
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

  it('unions show-scoped and club-scoped grants and redacts emails', async () => {
    const ctx = makeCtx({
      show: { data: { id: SHOW_ID, name: 'Spring Trial', club_id: CLUB_ID }, error: null },
      userRoles: [
        {
          data: [
            grant({ id: 'a', role: { name: 'secretary' }, show_id: SHOW_ID }),
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
      ],
    });

    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    expect(result.state).toBe('found');
    expect(result.summary).toMatchObject({ totalGrants: 2, activeGrants: 2, hasScopedSecretary: true });
    // Club-scoped club_admin is included even though show_id is null.
    expect(result.evidence.map((e) => e.label)).toEqual([
      'secretary (show-scoped)',
      'club_admin (club-scoped)',
    ]);
    // Emails are masked.
    expect(result.evidence[0]?.value).toContain('p***@example.com');
    expect(result.evidence[1]?.value).toContain('d***@club.org');
    expect(result.limitations).toHaveLength(0);
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
              role: { name: 'trial_secretary' },
              expires_at: '2000-01-01T00:00:00Z',
            }),
          ],
          error: null,
        },
      ],
    });

    const result = await listShowAccess({ showId: SHOW_ID }, ctx);
    const values = result.evidence.map((e) => String(e.value));
    expect(values.some((v) => v.endsWith('inactive'))).toBe(true);
    expect(values.some((v) => v.endsWith('expired'))).toBe(true);
    // No active secretary-like role → limitation present.
    expect(result.summary).toMatchObject({ hasScopedSecretary: false });
    expect(result.limitations.join(' ')).toContain('secretary');
  });
});
