import { describe, expect, it } from 'vitest';
import { runDeployMigrationGuard, type GuardCommand } from './deploy-migration-guard.ts';

const SHA = 'c'.repeat(40);
const FILES = '20261029043900_a.sql\n20261030174300_b.sql\nREADME.md\n';

function command(applied: string | Error, files: string | Error = FILES) {
  const calls: string[][] = [];
  const fn: GuardCommand = (name, args, env) => {
    calls.push([name, ...args]);
    if (name === 'git') {
      // Only the commit being deployed: a moving ref would reopen the race.
      expect(args[args.length - 1]).toBe(`${SHA}:supabase/migrations`);
      if (files instanceof Error) throw files;
      return files;
    }
    expect(Object.keys(env ?? {}).filter(k => k.startsWith('PG'))).toEqual(['PGPASSWORD']);
    if (applied instanceof Error) throw applied;
    return applied;
  };
  return { fn, calls };
}

describe('runDeployMigrationGuard (MYK9-1527)', () => {
  it('passes when every migration on the commit is applied', () => {
    const { fn } = command('20261029043900\n20261030174300\n20250101000000\n');
    expect(runDeployMigrationGuard(SHA, 'pw', fn).code).toBe(0);
  });

  it('refuses, naming the version, when the commit carries an unapplied migration', () => {
    const { fn } = command('20261029043900\n');
    expect(runDeployMigrationGuard(SHA, 'pw', fn)).toEqual({
      code: 1,
      reason: expect.stringContaining('20261030174300'),
    });
  });

  it('cannot decide when schema_migrations is unreadable, empty or malformed', () => {
    expect(runDeployMigrationGuard(SHA, 'pw', command(new Error('refused')).fn).code).toBe(2);
    expect(runDeployMigrationGuard(SHA, 'pw', command('').fn).code).toBe(2);
    expect(runDeployMigrationGuard(SHA, 'pw', command('abc\n').fn).code).toBe(2);
  });

  it('cannot decide when the commit tree is unreadable', () => {
    const { fn } = command('20261029043900\n', new Error('bad object'));
    expect(runDeployMigrationGuard(SHA, 'pw', fn).code).toBe(2);
  });

  it('refuses a missing or short sha and a missing password without running anything', () => {
    for (const [sha, pw] of [
      [undefined, 'pw'],
      ['abc123', 'pw'],
      [SHA, undefined],
    ] as const) {
      const { fn, calls } = command('20261029043900\n20261030174300\n');
      expect(runDeployMigrationGuard(sha, pw, fn).code).toBe(2);
      expect(calls).toEqual([]);
    }
  });
});
