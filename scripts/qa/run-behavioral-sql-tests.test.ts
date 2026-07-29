import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const runner = resolve(repositoryRoot, 'scripts/qa/run-behavioral-sql-tests.sh');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');

describe('behavioral SQL test harness', () => {
  it('executes every committed behavioral SQL file through psql', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'myk9-behavioral-sql-'));
    const fakePsql = join(scratch, 'psql');
    const invocationLog = join(scratch, 'psql.log');

    try {
      writeFileSync(
        fakePsql,
        ['#!/usr/bin/env bash', `printf '%s\\n' "$*" >>"$MYK9_FAKE_PSQL_LOG"`, ''].join('\n'),
        'utf8'
      );
      chmodSync(fakePsql, 0o755);

      const result = spawnSync('bash', [runner], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${scratch}:${process.env.PATH ?? ''}`,
          MYK9_BEHAVIORAL_SQL_DATABASE_URL:
            'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
          MYK9_FAKE_PSQL_LOG: invocationLog,
        },
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);

      const expectedFiles = readdirSync(resolve(repositoryRoot, 'supabase/tests'))
        .filter(file => file.endsWith('.sql'))
        .sort();
      const invokedFiles = readFileSync(invocationLog, 'utf8')
        .trim()
        .split('\n')
        .map(line => basename(line.match(/ -f (.+)$/)?.[1] ?? ''))
        .sort();

      expect(invokedFiles).toEqual(expectedFiles);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it.each([
    ['remote authority', 'postgresql://postgres:secret@database.example.com:5432/postgres'],
    [
      'libpq host override',
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=192.0.2.1',
    ],
  ])('rejects a %s database URL before invoking psql', (_label, databaseUrl) => {
    const result = spawnSync('bash', [runner], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        MYK9_BEHAVIORAL_SQL_DATABASE_URL: databaseUrl,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exact local loopback');
  });

  it('starts a clean migrated local Supabase target in CI and always stops it', () => {
    expect(workflow).toMatch(/supabase\/setup-cli@v\d+/);
    expect(workflow).toContain('supabase start --exclude');
    expect(workflow).toContain('supabase db reset --no-seed');
    expect(workflow).toContain('bash scripts/qa/run-behavioral-sql-tests.sh');
    expect(workflow).toContain('supabase stop --no-backup');
  });
});
