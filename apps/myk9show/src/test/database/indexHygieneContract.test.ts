import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const additiveMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260728140000_add_foreign_key_indexes.sql'
);
const subtractiveMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260728141000_drop_duplicate_indexes.sql'
);

const expectedForeignKeyPairs = [
  ['analytics_events', 'user_id'],
  ['chatbot_feedback', 'query_log_id'],
  ['chatbot_feedback', 'user_id'],
  ['chatbot_query_log', 'user_id'],
  ['class_visibility_overrides', 'updated_by'],
  ['classes', 'deleted_by'],
  ['classes', 'results_released_by'],
  ['club_access_requests', 'approved_club_id'],
  ['club_access_requests', 'requester_person_id'],
  ['club_access_requests', 'reviewed_by'],
  ['clubs', 'deleted_by'],
  ['dog_favorites', 'show_id'],
  ['dogs', 'deleted_by'],
  ['enrollments', 'handler_id'],
  ['entries', 'deleted_by'],
  ['entries', 'promo_code_id'],
  ['entries', 'refund_decided_by'],
  ['frontend_logs', 'user_id'],
  ['manual_results', 'sport_template_id'],
  ['onboarding_requests', 'auth_user_id'],
  ['operator_alerts', 'resolved_by'],
  ['paperwork_prints', 'class_id'],
  ['paperwork_prints', 'show_id'],
  ['paperwork_prints', 'trial_id'],
  ['pedigree_ancestors', 'linked_dog_id'],
  ['people', 'deleted_by'],
  ['platform_settings', 'updated_by'],
  ['premium_generations', 'show_id'],
  ['premium_generations', 'template_id'],
  ['promo_codes', 'show_id'],
  ['result_submissions', 'show_id'],
  ['result_submissions', 'submitted_by'],
  ['result_submissions', 'trial_id'],
  ['ringside_sessions', 'show_passcode_id'],
  ['role_requests', 'club_id'],
  ['role_requests', 'reviewed_by'],
  ['role_requests', 'show_id'],
  ['secretary_tasks', 'assignee_id'],
  ['secretary_tasks', 'club_id'],
  ['secretary_tasks', 'created_by'],
  ['secretary_tasks', 'show_id'],
  ['show_announcements', 'author_id'],
  ['show_incidents', 'class_id'],
  ['show_incidents', 'created_by'],
  ['show_incidents', 'dog_id'],
  ['show_incidents', 'entry_id'],
  ['show_incidents', 'handler_id'],
  ['show_incidents', 'judge_id'],
  ['show_incidents', 'trial_id'],
  ['show_lifecycle_email_attempts', 'attempted_by'],
  ['show_lifecycle_email_attempts', 'email_log_id'],
  ['show_lifecycle_email_jobs', 'correction_for_job_id'],
  ['show_lifecycle_email_jobs', 'created_by'],
  ['show_lifecycle_email_jobs', 'email_log_id'],
  ['show_lifecycle_email_jobs', 'enrollment_id'],
  ['show_lifecycle_email_jobs', 'entry_id'],
  ['show_lifecycle_email_jobs', 'recipient_person_id'],
  ['show_lifecycle_email_jobs', 'show_id'],
  ['show_lifecycle_email_jobs', 'updated_by'],
  ['show_message_threads', 'participant_id'],
  ['show_messages', 'sender_id'],
  ['show_messages', 'show_id'],
  ['show_payouts', 'club_stripe_account_id'],
  ['show_visibility_settings', 'updated_by'],
  ['shows', 'deleted_by'],
  ['sport_titles', 'prerequisite_title_id'],
  ['subscription_entitlement_grants', 'granted_by_person_id'],
  ['subscription_entitlement_grants', 'revoked_by_person_id'],
  ['subscription_entitlement_grants', 'superseded_by_grant_id'],
  ['support_ticket_messages', 'sender_id'],
  ['support_tickets', 'show_id'],
  ['trial_checklist_state', 'completed_by'],
  ['trial_judge_supplies', 'person_id'],
  ['trial_visibility_overrides', 'updated_by'],
  ['trials', 'deleted_by'],
  ['user_roles', 'club_id'],
  ['user_roles', 'show_id'],
  ['waitlist_entries', 'promoted_entry_id'],
] as const;

function readAdditiveMigration(): string {
  expect(
    existsSync(additiveMigrationPath),
    'The additive FK-index migration must exist before this contract can pass'
  ).toBe(true);
  return readFileSync(additiveMigrationPath, 'utf8');
}

function readSubtractiveMigration(): string {
  expect(
    existsSync(subtractiveMigrationPath),
    'The duplicate-index removal migration must exist before this contract can pass'
  ).toBe(true);
  return readFileSync(subtractiveMigrationPath, 'utf8');
}

function extractCreatedIndexes(sql: string): Array<{
  name: string;
  table: string;
  column: string;
}> {
  return [
    ...sql.matchAll(
      /create\s+index\s+if\s+not\s+exists\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s*(?:using\s+btree\s*)?\(\s*([a-z0-9_]+)\s*\)/gi
    ),
  ].map(([, name, table, column]) => ({ name, table, column }));
}

describe('MYK9-113 index hygiene migration contract', () => {
  it('adds one strict leading-column index for every uncovered public foreign key', () => {
    const migration = readAdditiveMigration();
    const indexes = extractCreatedIndexes(migration);
    const actualPairs = indexes.map(({ table, column }) => `${table}.${column}`).sort();
    const expectedPairs = expectedForeignKeyPairs
      .map(([table, column]) => `${table}.${column}`)
      .sort();

    expect(expectedForeignKeyPairs).toHaveLength(78);
    expect(actualPairs).toEqual(expectedPairs);
    expect(indexes.every(({ name }) => name.length <= 63)).toBe(true);
    expect(migration).not.toMatch(/\bdrop\s+index\b/i);
  });

  it('fails closed unless every public foreign key has strict catalog coverage', () => {
    const migration = readAdditiveMigration().toLowerCase();

    expect(migration).toContain('i.indpred is null');
    expect(migration).toContain('(i.indkey::smallint[])[0:cardinality(c.conkey) - 1] @> c.conkey');
    expect(migration).toContain('raise exception');
    expect(migration).toContain('uncovered public foreign keys');
  });

  it('keeps reviewed duplicate drops separate and protects the canonical indexes', () => {
    const additiveMigration = readAdditiveMigration();
    const subtractiveMigration = readSubtractiveMigration().toLowerCase();
    const droppedIndexes = [
      ...subtractiveMigration.matchAll(/drop\s+index\s+if\s+exists\s+public\.([a-z0-9_]+)/gi),
    ]
      .map(([, indexName]) => indexName)
      .sort();

    expect(additiveMigration).not.toMatch(/\bdrop\s+index\b/i);
    expect(subtractiveMigration).not.toMatch(/\bcreate\s+(?:unique\s+)?index\b/i);
    expect(droppedIndexes).toEqual([
      'platform_waitlist_email_unique',
      'push_subscriptions_user_id_idx',
    ]);
    expect(subtractiveMigration).toContain("to_regclass('public.platform_waitlist_email_key')");
    expect(subtractiveMigration).toContain("to_regclass('public.idx_push_subscriptions_user_id')");
    expect(subtractiveMigration).toContain("to_regclass('public.platform_waitlist_email_unique')");
    expect(subtractiveMigration).toContain("to_regclass('public.push_subscriptions_user_id_idx')");
    expect(subtractiveMigration).toContain('keep_index.indisvalid');
    expect(subtractiveMigration).toContain('keep_index.indisready');
    expect(subtractiveMigration).toContain('drop_index.indisvalid');
    expect(subtractiveMigration).toContain('drop_index.indisready');
    expect(subtractiveMigration).toContain(
      'keep_index.indnullsnotdistinct = drop_index.indnullsnotdistinct'
    );
  });
});
