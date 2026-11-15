import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_ONLY_ARGS,
  SCHEMA_ONLY_ARGS,
  buildPgRestoreArgs,
  buildPsqlInvocation,
  withoutPgVars,
  writePlanFile,
} from './single-show-restore-commands';
import { parseRestoreArgs, targetConnection } from './single-show-restore-guards';

const SHOW = '00000000-0000-0000-0000-00000000000a';

describe('single-show restore commands', () => {
  it('builds the pg_restore extraction argv for schema and data passes', () => {
    expect(buildPgRestoreArgs(SCHEMA_ONLY_ARGS, '/tmp/out.sql', '/d/database.dump')).toEqual([
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '-f',
      '/tmp/out.sql',
      '/d/database.dump',
    ]);
    expect(buildPgRestoreArgs(DATA_ONLY_ARGS, 'o', 'd')).toEqual([
      '--data-only',
      '--schema',
      'public',
      '--no-owner',
      '--no-privileges',
      '-f',
      'o',
      'd',
    ]);
  });

  it('builds a psql call that stops on error and keeps the secret out of argv', () => {
    const args = parseRestoreArgs([
      '--dir',
      'x',
      '--show-id',
      SHOW,
      '--execute',
      '--target-ref',
      'abcdefghijklmnopqrst',
    ]);
    const connection = targetConnection(
      'postgresql://postgres.abcdefghijklmnopqrst:s3cret@aws-0-us.pooler.supabase.com:6543/postgres',
      args
    );
    const psql = buildPsqlInvocation(connection, { PATH: '/bin', PGPASSWORD: 'stale' }, '/ca.crt');
    expect(psql.args).toEqual(['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-']);
    expect(psql.args.join(' ')).not.toContain('s3cret');
    expect(psql.env).toMatchObject({
      PATH: '/bin',
      PGPASSWORD: 's3cret',
      PGHOST: 'aws-0-us.pooler.supabase.com',
      PGPORT: '6543',
      PGUSER: 'postgres.abcdefghijklmnopqrst',
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: '/ca.crt',
    });
  });

  it('strips every inherited PG variable before the target env is applied', () => {
    const inherited = {
      PATH: '/bin',
      HOME: '/h',
      PGSERVICE: 'prod',
      PGHOSTADDR: '10.0.0.1',
      PGOPTIONS: '-c x=1',
      PGPASSFILE: '/p',
      pgsysconfdir: '/x',
    };
    expect(withoutPgVars(inherited)).toEqual({ PATH: '/bin', HOME: '/h' });
    const args = parseRestoreArgs([
      '--dir',
      'x',
      '--show-id',
      SHOW,
      '--execute',
      '--target-ref',
      'abcdefghijklmnopqrst',
    ]);
    const connection = targetConnection(
      'postgresql://postgres.abcdefghijklmnopqrst:s@h.pooler.supabase.com:5432/postgres',
      args
    );
    const env = buildPsqlInvocation(connection, inherited, '/ca.crt').env;
    for (const key of ['PGSERVICE', 'PGHOSTADDR', 'PGOPTIONS', 'PGPASSFILE', 'pgsysconfdir'])
      expect(env, key).not.toHaveProperty(key);
    expect(env.PGHOST).toBe('h.pooler.supabase.com');
  });

  it('writes the plan owner-only, including over a file that already exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'myk9-plan-test-'));
    try {
      const file = join(dir, 'plan.sql');
      writeFileSync(file, 'old');
      chmodSync(file, 0o644);
      writePlanFile(file, 'new plan');
      expect(readFileSync(file, 'utf8')).toBe('new plan');
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const fresh = join(dir, 'fresh.sql');
      writePlanFile(fresh, 'x');
      expect(statSync(fresh).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
