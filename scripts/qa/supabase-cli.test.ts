import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PINNED_CLI, supabaseBin, supabaseEnv } from './supabase-cli';

describe('supabaseBin (MYK9-1664)', () => {
  it('runs the pinned 3.x CLI when it is installed, never Homebrew from PATH', () => {
    expect(supabaseBin('/repo', p => p === join('/repo', PINNED_CLI))).toBe(
      join('/repo', PINNED_CLI)
    );
  });

  it('falls back to PATH where the pinned CLI is not installed', () => {
    expect(supabaseBin('/repo', () => false)).toBe('supabase');
  });
});

describe('supabaseEnv (MYK9-1664)', () => {
  const tokenFile = (body: string) => {
    const file = join(mkdtempSync(join(tmpdir(), 'sb-token-')), 'access-token');
    writeFileSync(file, body);
    return file;
  };

  it('supplies the stored login token so 3.x never blocks reading it', () => {
    expect(supabaseEnv({ PATH: '/bin' }, tokenFile('sbp_abc\n'))).toEqual({
      PATH: '/bin',
      SUPABASE_ACCESS_TOKEN: 'sbp_abc',
    });
  });

  it('keeps a token the caller already set', () => {
    const env = { SUPABASE_ACCESS_TOKEN: 'sbp_ci' };
    expect(supabaseEnv(env, tokenFile('sbp_file'))).toBe(env);
  });

  it('leaves the env alone when there is no login file or it is empty', () => {
    const env = { PATH: '/bin' };
    expect(supabaseEnv(env, join(tmpdir(), 'no-such-dir', 'access-token'))).toBe(env);
    expect(supabaseEnv(env, tokenFile('  \n'))).toBe(env);
  });
});
