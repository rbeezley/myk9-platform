import { spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertSupportedVersion,
  INSTALL_INSTRUCTION,
  PINNED_CLI,
  supabaseBin,
  supabaseCommand,
  supabaseEnv,
} from './supabase-cli';

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

describe('assertSupportedVersion (MYK9-2335)', () => {
  it('accepts 3.x', () => {
    expect(() => assertSupportedVersion('3.2.0\n', 'x')).not.toThrow();
  });

  it.each(['2.121.0', '', '13.0.0', '30.1.0'])('refuses %j and names the install command', v => {
    expect(() => assertSupportedVersion(v, '/bin/supabase')).toThrow(INSTALL_INSTRUCTION);
  });
});

describe('scripts/supabase.sh version check (MYK9-2335)', () => {
  const fakeRoot = (version: string) => {
    const root = mkdtempSync(join(tmpdir(), 'sb-sh-'));
    mkdirSync(join(root, 'scripts'));
    copyFileSync(join(__dirname, '..', 'supabase.sh'), join(root, 'scripts', 'supabase.sh'));
    const bin = join(root, 'apps', 'myk9show', 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, 'supabase'),
      `#!/usr/bin/env bash\n[ "$1" = --version ] && echo ${version} && exit 0\necho ran "$@"\n`
    );
    chmodSync(join(bin, 'supabase'), 0o755);
    return join(root, 'scripts', 'supabase.sh');
  };
  const run = (script: string) =>
    spawnSync('bash', [script, 'functions', 'list'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: tmpdir() },
    });

  it('refuses a 2.x binary and names the install command', () => {
    const res = run(fakeRoot('2.121.0'));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain(INSTALL_INSTRUCTION);
  });

  it('runs a 3.x binary with the caller arguments', () => {
    const res = run(fakeRoot('3.2.0'));
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('ran functions list\n');
  });
});

describe('supabaseCommand on Windows (MYK9-2335)', () => {
  it('runs the package JS entry under node, never the extensionless .bin shim', () => {
    const root = mkdtempSync(join(tmpdir(), 'sb-root-'));
    const pkgDir = join(root, 'apps', 'myk9show', 'node_modules', 'supabase');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ bin: { supabase: 'dist/supabase.js' } })
    );
    expect(supabaseCommand(root, () => true, 'win32')).toEqual({
      command: process.execPath,
      prefixArgs: [join(pkgDir, 'dist', 'supabase.js')],
    });
  });

  it('keeps the POSIX path unchanged', () => {
    expect(supabaseCommand('/repo', () => true, 'darwin')).toEqual({
      command: join('/repo', PINNED_CLI),
      prefixArgs: [],
    });
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
