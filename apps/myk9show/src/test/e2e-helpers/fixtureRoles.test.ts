import { describe, expect, it } from 'vitest';
import { compareFixtureRoles, fetchOwnRoleNames } from './fixtureRoles';

describe('compareFixtureRoles', () => {
  it('passes on an exact match regardless of order and duplicates', () => {
    expect(
      compareFixtureRoles('a@x', ['exhibitor', 'steward'], ['steward', 'exhibitor', 'steward'])
    ).toEqual({
      ok: true,
    });
  });

  it('flags an extra staff role with the drift headline first', () => {
    const verdict = compareFixtureRoles(
      'exhibitor@myk9t.com',
      ['exhibitor'],
      ['secretary', 'exhibitor']
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const [first, second] = verdict.message.split('\n');
    expect(first).toBe(
      'E2E fixture account drifted: exhibitor@myk9t.com expected roles [exhibitor] but has [exhibitor, secretary]'
    );
    expect(second).toContain('staging data problem, not a product failure');
    expect(second).toContain('docs/operations/e2e-fixture-accounts.md');
  });

  it('flags a missing expected role', () => {
    const verdict = compareFixtureRoles('s@x', ['exhibitor', 'secretary'], ['exhibitor']);
    expect(verdict.ok).toBe(false);
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
});
