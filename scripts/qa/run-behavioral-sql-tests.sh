#!/usr/bin/env bash
# Run the launch-critical behavioral SQL contracts against a local migrated
# Supabase database. The loopback guard makes it impossible to point this
# harness at a shared staging or production database.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$REPO_ROOT/supabase/tests"
DATABASE_URL="${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "FAIL: MYK9_BEHAVIORAL_SQL_DATABASE_URL is required." >&2
  exit 1
fi

LOCAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if [ "$DATABASE_URL" != "$LOCAL_DATABASE_URL" ]; then
  echo "FAIL: behavioral SQL tests require the exact local loopback database URL." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "FAIL: psql is required for behavioral SQL tests." >&2
  exit 1
fi

# Explicit, not a glob: a test file added to supabase/tests/ without a line here
# never executes and reads as coverage. Register new tests here AND in
# launchCriticalSqlTests in run-behavioral-sql-tests.test.ts.
#
# This list is EXHAUSTIVE, not curated: every .sql file in supabase/tests/ must
# appear. The contract test asserts the two lists agree with EACH OTHER, so a
# file absent from BOTH still passes green — that gap left four tests dormant
# until 2026-07-31 (MYK9-130). A directory-coverage assertion now closes it.
TEST_FILES=(
  "$TEST_DIR/anonymous_session_read_scope_test.sql"
  "$TEST_DIR/askq_quota_reservation_test.sql"
  "$TEST_DIR/class_hide_count_gating_test.sql"
  "$TEST_DIR/class_status_auto_derivation_test.sql"
  "$TEST_DIR/club_secretary_grant_test.sql"
  "$TEST_DIR/create_show_with_children_tenant_isolation_test.sql"
  "$TEST_DIR/entries_manager_policy_hashable_test.sql"
  "$TEST_DIR/anon_tv_entry_soft_delete_test.sql"
  "$TEST_DIR/judge_assignment_private_read_test.sql"
  "$TEST_DIR/office_admin_rls_test.sql"
  "$TEST_DIR/entry_status_history_rls_test.sql"
  "$TEST_DIR/entry_views_soft_delete_test.sql"
  "$TEST_DIR/image_storage_upsert_rls_test.sql"
  "$TEST_DIR/myk9_114_entry_access_context_test.sql"
  "$TEST_DIR/myk9_169_role_boundaries_test.sql"
  "$TEST_DIR/notification_preferences_sms_rls_test.sql"
  "$TEST_DIR/paperwork_prints_rls_test.sql"
  "$TEST_DIR/placement_soft_delete_ranking_test.sql"
  "$TEST_DIR/pre_rule_table_grants_test.sql"
  "$TEST_DIR/pull_refund_decision_rls_test.sql"
  "$TEST_DIR/rbac_access_lookup_authorization_test.sql"
  "$TEST_DIR/recoverable_show_access_codes_test.sql"
  "$TEST_DIR/ringside_containment_test.sql"
  "$TEST_DIR/sign_in_email_invariant_test.sql"
  "$TEST_DIR/subscription_entitlement_grants_test.sql"
  "$TEST_DIR/support_triage_atomic_send_test.sql"
  "$TEST_DIR/show_email_delivery_history_test.sql"
)

for test_file in "${TEST_FILES[@]}"; do
  if [ ! -f "$test_file" ]; then
    echo "FAIL: missing behavioral SQL test $test_file." >&2
    exit 1
  fi
  echo "── $(basename "$test_file") ──"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$test_file"
done

echo "BEHAVIORAL SQL TESTS PASSED (${#TEST_FILES[@]} files)"
