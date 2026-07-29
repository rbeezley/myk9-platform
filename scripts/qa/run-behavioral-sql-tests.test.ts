import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const runner = resolve(repositoryRoot, 'scripts/qa/run-behavioral-sql-tests.sh');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
const pullRefundFixture = readFileSync(
  resolve(repositoryRoot, 'supabase/tests/pull_refund_decision_rls_test.sql'),
  'utf8'
);
const launchCriticalSqlTests = [
  'myk9_114_entry_access_context_test.sql',
  'pull_refund_decision_rls_test.sql',
  'recoverable_show_access_codes_test.sql',
  'subscription_entitlement_grants_test.sql',
];

describe('behavioral SQL test harness', () => {
  it('seeds pull/refund people before auth users so the signup trigger adopts them', () => {
    const peopleInsert = pullRefundFixture.indexOf('INSERT INTO public.people');
    const authInsert = pullRefundFixture.indexOf('INSERT INTO auth.users');

    expect(peopleInsert).toBeGreaterThan(-1);
    expect(peopleInsert).toBeLessThan(authInsert);
    expect(pullRefundFixture.slice(peopleInsert, authInsert)).toContain('auth_user_id');
    expect(pullRefundFixture.slice(peopleInsert, authInsert)).toContain('NULL');
    expect(pullRefundFixture).toContain(
      'INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)'
    );

    const paidEntryInsert = pullRefundFixture.indexOf('INSERT INTO public.entries');
    const paymentServiceRole = pullRefundFixture.lastIndexOf(
      'SET LOCAL ROLE service_role',
      paidEntryInsert
    );
    const paymentServiceReset = pullRefundFixture.indexOf('RESET ROLE', paidEntryInsert);
    const userRoleInsert = pullRefundFixture.indexOf('INSERT INTO public.user_roles');

    expect(paymentServiceRole).toBeGreaterThan(authInsert);
    expect(paymentServiceReset).toBeGreaterThan(paidEntryInsert);
    expect(paymentServiceReset).toBeLessThan(userRoleInsert);
  });

  it('executes every launch-critical behavioral SQL file through psql', () => {
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

      const invokedFiles = readFileSync(invocationLog, 'utf8')
        .trim()
        .split('\n')
        .map(line => basename(line.match(/ -f (.+)$/)?.[1] ?? ''))
        .sort();

      expect(invokedFiles).toEqual([...launchCriticalSqlTests].sort());
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
