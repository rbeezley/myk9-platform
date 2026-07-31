import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
const recoverableAccessFixture = readFileSync(
  resolve(repositoryRoot, 'supabase/tests/recoverable_show_access_codes_test.sql'),
  'utf8'
);
const subscriptionEntitlementFixture = readFileSync(
  resolve(repositoryRoot, 'supabase/tests/subscription_entitlement_grants_test.sql'),
  'utf8'
);
// Deliberately a second copy of the runner's TEST_FILES list rather than an import
// of it: the assertion below is what stops a launch-critical test being quietly
// dropped from the harness. Registering a test means editing BOTH this list and
// scripts/qa/run-behavioral-sql-tests.sh.
//
// Keep both EXHAUSTIVE over supabase/tests/ — that agreement check cannot catch a
// file added to neither list, so the directory-coverage test below does.
const launchCriticalSqlTests = [
  'class_status_auto_derivation_test.sql',
  'club_secretary_grant_test.sql',
  'create_show_with_children_tenant_isolation_test.sql',
  'entries_manager_policy_hashable_test.sql',
  'entry_status_history_rls_test.sql',
  'myk9_114_entry_access_context_test.sql',
  'paperwork_prints_rls_test.sql',
  'pre_rule_table_grants_test.sql',
  'pull_refund_decision_rls_test.sql',
  'rbac_access_lookup_authorization_test.sql',
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
    const paymentServiceGrant = pullRefundFixture.indexOf(
      'GRANT INSERT ON public.entries TO service_role'
    );
    const paymentServiceRole = pullRefundFixture.lastIndexOf(
      'SET LOCAL ROLE service_role',
      paidEntryInsert
    );
    const paymentServiceReset = pullRefundFixture.indexOf('RESET ROLE', paidEntryInsert);
    const userRoleInsert = pullRefundFixture.indexOf('INSERT INTO public.user_roles');

    expect(paymentServiceRole).toBeGreaterThan(authInsert);
    expect(paymentServiceGrant).toBeGreaterThan(authInsert);
    expect(paymentServiceGrant).toBeLessThan(paymentServiceRole);
    expect(paymentServiceReset).toBeGreaterThan(paidEntryInsert);
    expect(paymentServiceReset).toBeLessThan(userRoleInsert);
    expect(pullRefundFixture).toContain('GRANT SELECT ON public.people TO authenticated');
    expect(pullRefundFixture).toContain('GRANT SELECT ON public.dogs TO authenticated');
    expect(pullRefundFixture).toContain(
      'GRANT UPDATE (refund_decision) ON public.entries TO authenticated'
    );
    expect(pullRefundFixture).toContain(
      'INSERT INTO public.user_roles (user_id, role_id, show_id, club_id, is_active, auth_user_id)'
    );
    expect(pullRefundFixture).toContain(
      "IF SQLERRM <> 'refund decisions are written only through set_entry_refund_decision'"
    );
  });

  it('registers every SQL file that lives in supabase/tests', () => {
    // The two-list agreement check below catches a test being REMOVED from the
    // harness. It cannot catch one that was never added, because a file absent
    // from both lists keeps them equal. Four tests stayed dormant that way
    // (MYK9-130); this reads the directory so the omission fails loudly.
    const onDisk = readdirSync(resolve(repositoryRoot, 'supabase/tests'))
      .filter(entry => entry.endsWith('.sql'))
      .sort();

    expect(onDisk).toEqual([...launchCriticalSqlTests].sort());
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

  it('uses the current shows schema in the recoverable access-code fixture', () => {
    expect(recoverableAccessFixture).toContain(
      'id, name, organization, start_date, end_date, club_id, status'
    );
    expect(recoverableAccessFixture).not.toContain('id, name, type, organization');
    expect(recoverableAccessFixture).toContain(
      'insert into public.classes (id, trial_id, name, status)'
    );
    expect(recoverableAccessFixture).not.toContain(
      'insert into public.classes (id, trial_id, show_id, name, status)'
    );
    expect(recoverableAccessFixture).toContain("'Container Novice',\n  'upcoming'");
    expect(recoverableAccessFixture).not.toContain("'no-status'");
  });

  it('grants the payment role only the subscription fixture access it needs', () => {
    expect(subscriptionEntitlementFixture).toContain(
      'GRANT SELECT (person_id) ON public.exhibitor_profiles TO service_role'
    );
    expect(subscriptionEntitlementFixture).toContain(
      'GRANT UPDATE (subscription_tier, subscription_expires_at) ON public.exhibitor_profiles TO service_role'
    );
    expect(subscriptionEntitlementFixture).toContain(
      'GRANT SELECT, INSERT, DELETE ON public.vaccinations TO authenticated'
    );
    expect(subscriptionEntitlementFixture).toContain(
      'GRANT INSERT ON public.pedigree_ancestors TO authenticated'
    );
    expect(subscriptionEntitlementFixture).toContain(
      'GRANT SELECT ON public.dogs TO authenticated'
    );
    expect(subscriptionEntitlementFixture).toContain(
      'GRANT SELECT ON public.stripe_customers TO authenticated'
    );
    expect(subscriptionEntitlementFixture).toContain(
      `IF SQLERRM <> 'new row violates row-level security policy for table "vaccinations"'`
    );
    expect(subscriptionEntitlementFixture).toContain(
      `IF SQLERRM <> 'new row violates row-level security policy for table "pedigree_ancestors"'`
    );
    expect(subscriptionEntitlementFixture).not.toContain(
      'FAIL no backfilled founding grants remain'
    );
    expect(subscriptionEntitlementFixture).toContain(
      'PASS clean schema has no legacy early-adopter rows and the legacy column is absent'
    );
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
