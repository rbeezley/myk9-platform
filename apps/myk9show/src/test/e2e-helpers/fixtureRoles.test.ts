import { describe, expect, it } from 'vitest';
import { FIXTURE_ROLE_RULES, compareFixtureRoles, fetchOwnRoleNames } from './fixtureRoles';

describe('compareFixtureRoles', () => {
  const rule = { required: ['exhibitor', 'steward'], forbidden: ['site_admin', 'judge'] };

  it('passes when required roles are present, in any order, with tolerated extras', () => {
    expect(compareFixtureRoles('a@x', rule, ['steward', 'club_admin', 'exhibitor'])).toEqual({
      ok: true,
    });
  });

  it('flags a forbidden role with the drift headline first', () => {
    const verdict = compareFixtureRoles('exhibitor@myk9t.com', FIXTURE_ROLE_RULES.exhibitor, [
      'secretary',
      'exhibitor',
    ]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const [first, second] = verdict.message.split('\n');
    expect(first).toBe(
      'E2E fixture account drifted: exhibitor@myk9t.com has forbidden [secretary]'
    );
    expect(second).toContain('staging data problem, not a product failure');
    expect(second).toContain('docs/operations/e2e-fixture-accounts.md');
  });

  it('flags a missing required role', () => {
    const verdict = compareFixtureRoles('s@x', rule, ['exhibitor']);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok)
      expect(verdict.message.split('\n')[0]).toBe(
        'E2E fixture account drifted: s@x is missing [steward]'
      );
  });

  it('reports missing and forbidden together', () => {
    const verdict = compareFixtureRoles('s@x', rule, ['judge']);
    if (verdict.ok) throw new Error('expected drift');
    expect(verdict.message.split('\n')[0]).toBe(
      'E2E fixture account drifted: s@x is missing [exhibitor, steward] and has forbidden [judge]'
    );
  });

  it('tolerates the club_admin grants staging accrues on the secretary', () => {
    expect(
      compareFixtureRoles('secretary@myk9t.com', FIXTURE_ROLE_RULES.secretary, [
        'secretary',
        'steward',
        'exhibitor',
        'club_admin',
      ]).ok
    ).toBe(true);
  });
});

describe('fetchOwnRoleNames', () => {
  it('posts the own user id with the user token and ignores inactive rows', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify([
          { role_name: 'exhibitor', is_active: true },
          { role_name: 'secretary', is_active: false },
        ]),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const roles = await fetchOwnRoleNames(
      'https://p.supabase.co/',
      'anon',
      'tok',
      'uid-1',
      fakeFetch
    );
    expect(roles).toEqual(['exhibitor']);
    expect(calls[0].url).toBe('https://p.supabase.co/rest/v1/rpc/get_user_roles');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ user_id: 'uid-1' });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    await expect(fetchOwnRoleNames('https://p', 'a', 't', 'u', fakeFetch)).rejects.toThrow(
      'HTTP 403'
    );
  });
  it('treats an exhibitor grant on the judge fixture as drift (seed 10g)', () => {
    const verdict = compareFixtureRoles('judge@x', FIXTURE_ROLE_RULES.judge, [
      'judge',
      'exhibitor',
    ]);
    expect(verdict).toEqual({
      ok: false,
      message: expect.stringContaining(
        'E2E fixture account drifted: judge@x has forbidden [exhibitor]'
      ),
    });
  });
});
