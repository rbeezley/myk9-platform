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
  "$TEST_DIR/admin_soft_deleted_show_visibility_test.sql"
  "$TEST_DIR/anonymous_session_read_scope_test.sql"
  "$TEST_DIR/askq_quota_reservation_test.sql"
  "$TEST_DIR/class_hide_count_gating_test.sql"
  "$TEST_DIR/class_status_auto_derivation_test.sql"
  "$TEST_DIR/class_lifecycle_absent_parity_test.sql"
  "$TEST_DIR/checkout_confirmation_on_insert_test.sql"
  "$TEST_DIR/club_access_request_approval_test.sql"
  "$TEST_DIR/club_secretary_grant_test.sql"
  "$TEST_DIR/club_show_managers_visibility_test.sql"
  "$TEST_DIR/club_delete_restrict_test.sql"
  "$TEST_DIR/stripe_ledger_fks_restrict_test.sql"
  "$TEST_DIR/create_show_with_children_tenant_isolation_test.sql"
  "$TEST_DIR/entries_insert_show_scope_test.sql"
  "$TEST_DIR/enrollments_select_club_scope_test.sql"
  "$TEST_DIR/show_publish_gate_trigger_test.sql"
  "$TEST_DIR/club_authorization_gate_test.sql"
  "$TEST_DIR/club_routed_role_requests_test.sql"
  "$TEST_DIR/club_membership_requests_test.sql"
  "$TEST_DIR/myk9_737_class_results_push_test.sql"
  "$TEST_DIR/club_members_own_row_test.sql"
  "$TEST_DIR/entries_manager_policy_hashable_test.sql"
  "$TEST_DIR/entry_requires_dog_registration_test.sql"
  "$TEST_DIR/emergency_packet_handler_identity_test.sql"
  "$TEST_DIR/anon_tv_entry_soft_delete_test.sql"
  "$TEST_DIR/judge_assignment_private_read_test.sql"
  "$TEST_DIR/judge_assignment_touches_class_test.sql"
  "$TEST_DIR/judge_qualification_rpc_authorization_test.sql"
  "$TEST_DIR/office_admin_rls_test.sql"
  "$TEST_DIR/one_registry_per_show_test.sql"
  "$TEST_DIR/null_club_show_authorization_test.sql"
  "$TEST_DIR/null_club_policy_authorization_test.sql"
  "$TEST_DIR/entry_status_history_rls_test.sql"
  "$TEST_DIR/move_up_supersession_test.sql"
  "$TEST_DIR/entry_views_soft_delete_test.sql"
  "$TEST_DIR/image_storage_upsert_rls_test.sql"
  "$TEST_DIR/myk9_694_premium_published_rls_test.sql"
  "$TEST_DIR/myk9_114_entry_access_context_test.sql"
  "$TEST_DIR/myk9_126_class_result_visibility_parity_test.sql"
  "$TEST_DIR/myk9_169_role_boundaries_test.sql"
  "$TEST_DIR/myk9_469_public_select_row_scope_test.sql"
  "$TEST_DIR/myk9_470_scoped_role_predicates_test.sql"
  "$TEST_DIR/myk9_472_view_write_grants_test.sql"
  "$TEST_DIR/myk9_474_public_judge_names_test.sql"
  "$TEST_DIR/myk9_691_update_show_style_test.sql"
  "$TEST_DIR/notification_preferences_sms_rls_test.sql"
  "$TEST_DIR/paperwork_prints_rls_test.sql"
  "$TEST_DIR/placement_soft_delete_ranking_test.sql"
  "$TEST_DIR/pre_rule_table_grants_test.sql"
  "$TEST_DIR/show_officials_label_not_permission_test.sql"
  "$TEST_DIR/show_announcements_scope_test.sql"
  "$TEST_DIR/show_message_tenant_isolation_test.sql"
  "$TEST_DIR/show_organization_immutability_test.sql"
  "$TEST_DIR/pull_refund_decision_rls_test.sql"
  "$TEST_DIR/rbac_access_lookup_authorization_test.sql"
  "$TEST_DIR/recoverable_show_access_codes_test.sql"
  "$TEST_DIR/ringside_containment_test.sql"
  "$TEST_DIR/self_checkin_entry_test.sql"
  "$TEST_DIR/submit_entries_started_class_test.sql"
  "$TEST_DIR/submit_entries_day_of_show_flag_test.sql"
  "$TEST_DIR/sign_in_email_invariant_test.sql"
  "$TEST_DIR/myk9_710_people_identity_guard_test.sql"
  "$TEST_DIR/myk9_711_712_status_and_signup_grants_test.sql"
  "$TEST_DIR/myk9_660_667_manager_reads_catalog_writes_test.sql"
  "$TEST_DIR/myk9_664_people_private_test.sql"
  "$TEST_DIR/myk9_705_656_class_entry_availability_test.sql"
  "$TEST_DIR/subscription_entitlement_grants_test.sql"
  "$TEST_DIR/support_triage_atomic_send_test.sql"
  "$TEST_DIR/support_ticket_creation_atomicity_test.sql"
  "$TEST_DIR/show_email_delivery_history_test.sql"
  "$TEST_DIR/soft_delete_dog_cascade_test.sql"
  "$TEST_DIR/force_delete_dog_test.sql"
  "$TEST_DIR/myk9_607_608_dog_delete_audit_restore_test.sql"
  "$TEST_DIR/user_roles_show_manager_read_test.sql"
  "$TEST_DIR/withdraw_own_entry_test.sql"
  "$TEST_DIR/withdraw_or_pull_own_entry_test.sql"
  "$TEST_DIR/myk9_719_scratch_requested_retired_test.sql"
  "$TEST_DIR/update_own_entry_jump_height_test.sql"
  "$TEST_DIR/update_entry_handler_for_entry_management_test.sql"
  "$TEST_DIR/seed_demo_paid_stray_guard_test.sql"
  "$TEST_DIR/seed_demo_paid_stray_guard_scopes_test.sql"
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
