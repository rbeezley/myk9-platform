import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const runner = resolve(repositoryRoot, 'scripts/qa/run-behavioral-sql-tests.sh');
const hardDeleteShowMigration = resolve(
  repositoryRoot,
  'supabase/migrations/20260920173147_harden_hard_delete_show_money_guards.sql'
);
const hardDeleteShowFixture = readFileSync(
  resolve(repositoryRoot, 'supabase/tests/hard_delete_show_money_guards_test.sql'),
  'utf8'
);
const hardDeleteShowDesign = readFileSync(
  resolve(repositoryRoot, 'openspec/changes/remove-orphan-e2e-show/design.md'),
  'utf8'
);
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
  'admin_soft_deleted_show_visibility_test.sql',
  'anonymous_session_read_scope_test.sql',
  'askq_quota_reservation_test.sql',
  'class_hide_count_gating_test.sql',
  'class_status_auto_derivation_test.sql',
  'class_lifecycle_absent_parity_test.sql',
  'checkout_confirmation_on_insert_test.sql',
  'club_access_request_approval_test.sql',
  'entry_requires_dog_registration_test.sql',
  'club_secretary_grant_test.sql',
  'club_show_managers_visibility_test.sql',
  'club_delete_restrict_test.sql',
  'hard_delete_show_money_guards_test.sql',
  'stripe_ledger_fks_restrict_test.sql',
  'create_show_with_children_tenant_isolation_test.sql',
  'show_officials_label_not_permission_test.sql',
  'show_announcements_scope_test.sql',
  'show_message_tenant_isolation_test.sql',
  'entries_insert_show_scope_test.sql',
  'enrollments_select_club_scope_test.sql',
  'show_publish_gate_trigger_test.sql',
  'club_authorization_gate_test.sql',
  'club_routed_role_requests_test.sql',
  'entries_manager_policy_hashable_test.sql',
  'null_club_show_authorization_test.sql',
  'null_club_policy_authorization_test.sql',
  'anon_tv_entry_soft_delete_test.sql',
  'move_up_supersession_test.sql',
  'judge_assignment_private_read_test.sql',
  'judge_assignment_touches_class_test.sql',
  'office_admin_rls_test.sql',
  'one_registry_per_show_test.sql',
  'entry_status_history_rls_test.sql',
  'entry_views_soft_delete_test.sql',
  'image_storage_upsert_rls_test.sql',
  'myk9_114_entry_access_context_test.sql',
  'myk9_126_class_result_visibility_parity_test.sql',
  'myk9_169_role_boundaries_test.sql',
  'myk9_469_public_select_row_scope_test.sql',
  'myk9_470_scoped_role_predicates_test.sql',
  'myk9_472_view_write_grants_test.sql',
  'myk9_474_public_judge_names_test.sql',
  'judge_qualification_rpc_authorization_test.sql',
  'notification_preferences_sms_rls_test.sql',
  'paperwork_prints_rls_test.sql',
  'placement_soft_delete_ranking_test.sql',
  'pre_rule_table_grants_test.sql',
  'pull_refund_decision_rls_test.sql',
  'rbac_access_lookup_authorization_test.sql',
  'recoverable_show_access_codes_test.sql',
  'ringside_containment_test.sql',
  'self_checkin_entry_test.sql',
  'submit_entries_started_class_test.sql',
  'submit_entries_day_of_show_flag_test.sql',
  'sign_in_email_invariant_test.sql',
  'subscription_entitlement_grants_test.sql',
  'support_triage_atomic_send_test.sql',
  'support_ticket_creation_atomicity_test.sql',
  'soft_delete_dog_cascade_test.sql',
  'force_delete_dog_test.sql',
  'show_email_delivery_history_test.sql',
  'user_roles_show_manager_read_test.sql',
  'withdraw_own_entry_test.sql',
  'withdraw_or_pull_own_entry_test.sql',
  'update_own_entry_jump_height_test.sql',
  'update_entry_handler_for_entry_management_test.sql',
  'seed_demo_paid_stray_guard_test.sql',
  'seed_demo_paid_stray_guard_scopes_test.sql',
];

describe('behavioral SQL test harness', () => {
  it('locks the target graph and checks a complete FK manifest before deleting', () => {
    expect(existsSync(hardDeleteShowMigration)).toBe(true);
    if (!existsSync(hardDeleteShowMigration)) return;

    const migration = readFileSync(hardDeleteShowMigration, 'utf8');
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)'
    );
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain('IF NOT (SELECT public.is_platform_admin()) THEN');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;'
    );
    expect(migration).toContain('DROP POLICY IF EXISTS shows_delete ON public.shows;');
    expect(migration).toContain(
      'REVOKE DELETE ON TABLE public.shows FROM PUBLIC, anon, authenticated;'
    );

    expect(migration).toContain('FROM pg_catalog.pg_constraint');
    expect(migration).toContain('pg_catalog.jsonb_to_recordset(v_fk_manifest)');
    expect(migration).toContain("IF v_edge.disposition = 'retain' THEN");
    expect(migration).toContain('pg_catalog.format(');
    expect(migration).toContain('%I.%I');
    expect(migration).toContain('child.%I');
    expect((migration.match(/EXECUTE pg_catalog\.format\(/g) ?? []).length).toBe(3);
    expect((migration.match(/USING p_show_id/g) ?? []).length).toBe(3);
    for (const associationTable of [
      'stripe_orders',
      'entry_payment_links',
      'stripe_order_refunds',
    ]) {
      expect(migration).not.toContain(`LOCK TABLE public.${associationTable}`);
    }

    const targetLock = migration.indexOf(
      'FROM public.shows\n  WHERE id = p_show_id\n  FOR UPDATE;'
    );
    const trialLock = migration.indexOf(
      'FROM public.trials\n  WHERE show_id = p_show_id\n  ORDER BY id\n  FOR UPDATE;'
    );
    const classLock = migration.indexOf('ORDER BY c.id\n  FOR UPDATE OF c;');
    const graphCheck = migration.indexOf('FROM pg_catalog.pg_constraint');
    const firstDelete = migration.indexOf('DELETE FROM public.classes');
    const deleteTargets = [...migration.matchAll(/DELETE\s+FROM\s+public\.([a-z_]+)/gi)].map(
      match => match[1]
    );

    expect(migration).toContain("PERFORM pg_catalog.set_config('lock_timeout', '2s', true);");
    expect(targetLock).toBeGreaterThanOrEqual(0);
    expect(trialLock).toBeGreaterThan(targetLock);
    expect(classLock).toBeGreaterThan(trialLock);
    expect(graphCheck).toBeGreaterThan(classLock);
    expect(firstDelete).toBeGreaterThan(graphCheck);
    expect(deleteTargets).toEqual(['classes', 'trials', 'shows']);
  });

  it('records every applied FK edge and only disposes structural show descendants', () => {
    const migration = readFileSync(hardDeleteShowMigration, 'utf8');
    const manifestMatch =
      /v_fk_manifest CONSTANT pg_catalog\.jsonb := \$manifest\$([\s\S]*?)\$manifest\$::pg_catalog\.jsonb;/i.exec(
        migration
      );
    expect(manifestMatch).not.toBeNull();
    const manifest = JSON.parse(manifestMatch?.[1] ?? '[]') as Array<{
      constraint_schema: string;
      constraint_name: string;
      child_schema: string;
      child_table: string;
      child_column: string;
      parent_schema: string;
      parent_table: string;
      parent_column: string;
      delete_action: string;
      disposition: string;
    }>;

    expect(manifest).toHaveLength(61);
    expect(new Set(manifest.map(edge => edge.constraint_name)).size).toBe(61);
    expect(
      manifest.every(
        edge =>
          edge.constraint_schema === 'public' &&
          edge.child_schema === 'public' &&
          edge.parent_schema === 'public' &&
          edge.parent_column === 'id'
      )
    ).toBe(true);
    const documentedConstraintNames = [
      ...hardDeleteShowDesign.matchAll(/^\| `([^`]+_fkey)`\s+\|/gm),
    ]
      .map(match => match[1])
      .sort();
    expect(manifest.map(edge => edge.constraint_name).sort()).toEqual(documentedConstraintNames);
    expect(manifest.filter(edge => edge.disposition === 'retain')).toHaveLength(59);
    expect(
      manifest
        .filter(edge => edge.disposition === 'disposable')
        .map(({ constraint_name, child_table, child_column, parent_table, delete_action }) => ({
          constraint_name,
          child_table,
          child_column,
          parent_table,
          delete_action,
        }))
        .sort((left, right) => left.constraint_name.localeCompare(right.constraint_name))
    ).toEqual([
      {
        constraint_name: 'classes_trial_id_fkey',
        child_table: 'classes',
        child_column: 'trial_id',
        parent_table: 'trials',
        delete_action: 'CASCADE',
      },
      {
        constraint_name: 'trials_show_id_fkey',
        child_table: 'trials',
        child_column: 'show_id',
        parent_table: 'shows',
        delete_action: 'CASCADE',
      },
    ]);
    expect(manifest.find(edge => edge.constraint_name === 'email_log_show_id_fkey')).toMatchObject({
      delete_action: 'SET NULL',
      disposition: 'retain',
    });
    expect(
      manifest.find(edge => edge.constraint_name === 'stripe_orders_show_id_fkey')
    ).toMatchObject({
      delete_action: 'RESTRICT',
      disposition: 'retain',
    });
  });

  it('covers unused-only refusal records, cross-show links, and an unknown empty FK', () => {
    for (const caseName of [
      'unused show with trials and classes',
      'unpaid enrollment',
      'unpaid entry',
      'entry status history',
      'result submission',
      'activity log',
      'show payout',
      'paperwork print',
      'show incident',
      'trial packet snapshot',
      'packet generation claim',
      'email log',
      'cross-show entry',
      'cross-show result submission',
      'unclassified empty FK',
    ]) {
      expect(hardDeleteShowFixture).toContain(caseName);
    }
    expect(hardDeleteShowFixture).toContain('CREATE TABLE public.qa_unknown_show_child');
    expect(hardDeleteShowFixture).toContain('REFERENCES public.shows(id) ON DELETE CASCADE');
    expect(hardDeleteShowFixture).toContain('retained evidence row was deleted');
  });

  it('registers the local-only two-session hard-delete concurrency harness', () => {
    const runnerSource = readFileSync(runner, 'utf8');
    const harness = resolve(repositoryRoot, 'scripts/qa/hard-delete-show-concurrency.sh');

    expect(runnerSource).toContain('hard-delete-show-concurrency.sh');
    expect(existsSync(harness)).toBe(true);
    if (!existsSync(harness)) return;

    const source = readFileSync(harness, 'utf8');
    expect(source).toContain('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(source).toContain('start_writer enrollment-insert');
    expect(source).toContain('start_writer cross-show-entry');
    expect(source).toContain('bounded lock timeout');
    expect(source).toContain('INSERT INTO public.entries');
    expect(source).toContain('automated retries are disabled');
    expect(source).toContain('pg_stat_activity');
    expect(source).not.toContain('payment-update');
    expect(source).not.toContain('entry-id-array');
    expect(source).not.toContain('entry_ids');
  });

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
    // Club-scoped since the label/permission split: a show-scoped row is
    // paperwork and grants nothing, so the fixture must appoint at the club or
    // the secretary it sets up cannot reach the show the test then exercises.
    expect(pullRefundFixture).toContain(
      'INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)'
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
          MYK9_SKIP_HARD_DELETE_CONCURRENCY: '1',
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
