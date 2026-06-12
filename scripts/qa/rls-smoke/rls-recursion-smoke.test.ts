import { describe, expect, it } from 'vitest';

import {
  buildSmokeQueries,
  classifyPostgrestFailure,
  parseEnvFile,
} from './rls-recursion-smoke';

describe('parseEnvFile', () => {
  it('parses KEY=value lines and strips quotes', () => {
    const env = parseEnvFile(
      [
        '# comment',
        '',
        'VITE_SUPABASE_URL=https://example.supabase.co',
        'VITE_SUPABASE_ANON_KEY="abc.def.ghi"',
        "VITE_APP_VERSION='1.2.3'",
        'NOT A KV LINE',
      ].join('\n')
    );

    expect(env).toEqual({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'abc.def.ghi',
      VITE_APP_VERSION: '1.2.3',
    });
  });

  it('keeps = characters inside values (JWTs, URLs)', () => {
    const env = parseEnvFile('KEY=left=right==');
    expect(env.KEY).toBe('left=right==');
  });
});

describe('buildSmokeQueries', () => {
  it('scopes entries reads to the show and embeds dogs through the FK', () => {
    const showId = '4584f257-19b5-4016-aae6-5e7827b769cb';
    const paths = buildSmokeQueries(showId).map((q) => q.path);

    expect(paths).toEqual([
      `entries?select=id,dog_id&show_id=eq.${showId}&limit=5`,
      'dogs?select=id,call_name&limit=5',
      `entries?select=id,dogs(id)&show_id=eq.${showId}&limit=5`,
    ]);
  });
});

describe('classifyPostgrestFailure', () => {
  it('flags 42P17 policy recursion by code', () => {
    const result = classifyPostgrestFailure(
      500,
      JSON.stringify({
        code: '42P17',
        message: 'infinite recursion detected in policy for relation "dogs"',
      })
    );

    expect(result.recursion).toBe(true);
    expect(result.summary).toContain('42P17');
    expect(result.summary).toContain('20260612090000');
  });

  it('flags recursion by message when the code is missing', () => {
    const result = classifyPostgrestFailure(
      500,
      JSON.stringify({
        message: 'infinite recursion detected in policy for relation "entries"',
      })
    );

    expect(result.recursion).toBe(true);
  });

  it('reports other failures without the recursion label', () => {
    const result = classifyPostgrestFailure(
      401,
      JSON.stringify({ code: 'PGRST301', message: 'JWT expired' })
    );

    expect(result.recursion).toBe(false);
    expect(result.summary).toBe('HTTP 401 code=PGRST301: JWT expired');
  });

  it('handles non-JSON bodies', () => {
    const result = classifyPostgrestFailure(502, '<html>Bad Gateway</html>');

    expect(result.recursion).toBe(false);
    expect(result.summary).toContain('HTTP 502');
  });
});
