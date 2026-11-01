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

# Any loopback port, so each worktree's stack can run at once; nothing else.
# Anchored with no query string: libpq options such as `?hostaddr=` or
# `?host=` would otherwise redirect a loopback-looking URL to another server.
LOOPBACK_URL_RE='^postgresql://postgres:postgres@(127\.0\.0\.1|localhost):([0-9]{1,5})/postgres$'
if ! [[ "$DATABASE_URL" =~ $LOOPBACK_URL_RE ]] ||
  [ "${BASH_REMATCH[2]}" -lt 1 ] || [ "${BASH_REMATCH[2]}" -gt 65535 ]; then
  echo "FAIL: behavioral SQL tests require a local loopback database URL" >&2
  echo "      (postgresql://postgres:postgres@127.0.0.1:<port>/postgres or localhost:<port>)." >&2
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
  "$TEST_DIR/myk9_939_nullable_entry_ownership_test.sql"
  "$TEST_DIR/admin_soft_deleted_show_visibility_test.sql"
  "$TEST_DIR/anonymous_session_read_scope_test.sql"
  "$TEST_DIR/askq_quota_reservation_test.sql"
  "$TEST_DIR/class_hide_count_gating_test.sql"
  "$TEST_DIR/class_status_auto_derivation_test.sql"
  "$TEST_DIR/class_actual_times_from_scoring_test.sql"
  "$TEST_DIR/class_lifecycle_absent_parity_test.sql"
  "$TEST_DIR/checkout_confirmation_on_insert_test.sql"
  "$TEST_DIR/club_access_request_approval_test.sql"
  "$TEST_DIR/club_secretary_grant_test.sql"
  "$TEST_DIR/club_show_managers_visibility_test.sql"
  "$TEST_DIR/club_officials_visibility_test.sql"
  "$TEST_DIR/club_delete_restrict_test.sql"
  "$TEST_DIR/stripe_ledger_fks_restrict_test.sql"
  "$TEST_DIR/create_show_with_children_tenant_isolation_test.sql"
  "$TEST_DIR/create_show_with_children_trial_timezone_test.sql"
  "$TEST_DIR/account_today_entries_show_timezone_test.sql"
  "$TEST_DIR/create_show_with_children_junior_fee_test.sql"
  "$TEST_DIR/entries_insert_show_scope_test.sql"
  "$TEST_DIR/enrollments_select_club_scope_test.sql"
  "$TEST_DIR/myk9_1601_entry_form_notes_test.sql"
  "$TEST_DIR/myk9_1634_enrollment_total_derived_test.sql"
  "$TEST_DIR/myk9_1634_submission_status_test.sql"
  "$TEST_DIR/myk9_1637_card_money_received_test.sql"
  "$TEST_DIR/show_publish_gate_trigger_test.sql"
  "$TEST_DIR/club_authorization_gate_test.sql"
  "$TEST_DIR/myk9_979_online_entries_switch_test.sql"
  "$TEST_DIR/myk9_909_club_creator_select_test.sql"
  "$TEST_DIR/myk9_952_demo_clubs_listing_test.sql"
  "$TEST_DIR/club_routed_role_requests_test.sql"
  "$TEST_DIR/club_membership_requests_test.sql"
  "$TEST_DIR/myk9_727_role_request_review_lock_test.sql"
  "$TEST_DIR/myk9_681_access_request_email_jobs_test.sql"
  "$TEST_DIR/myk9_737_class_results_push_test.sql"
  "$TEST_DIR/myk9_781_platform_settings_singleton_test.sql"
  "$TEST_DIR/myk9_824_submit_entries_handler_owner_fallback_test.sql"
  "$TEST_DIR/club_members_own_row_test.sql"
  "$TEST_DIR/entries_manager_policy_hashable_test.sql"
  "$TEST_DIR/entry_requires_dog_registration_test.sql"
  "$TEST_DIR/emergency_packet_handler_identity_test.sql"
  "$TEST_DIR/anon_tv_entry_soft_delete_test.sql"
  "$TEST_DIR/judge_assignment_private_read_test.sql"
  "$TEST_DIR/myk9_1540_nationals_leaderboard_inputs_test.sql"
  "$TEST_DIR/judge_assignment_touches_class_test.sql"
  "$TEST_DIR/myk9_1300_armbands_updated_at_test.sql"
  "$TEST_DIR/judge_qualification_rpc_authorization_test.sql"
  "$TEST_DIR/myk9_833_judge_draft_show_visibility_test.sql"
  "$TEST_DIR/myk9_819_passcode_draft_visibility_test.sql"
  "$TEST_DIR/myk9_841_staff_on_behalf_entries_accepted_test.sql"
  "$TEST_DIR/myk9_878_price_entry_fee_test.sql"
  "$TEST_DIR/myk9_878_submit_entries_junior_fee_test.sql"
  "$TEST_DIR/myk9_879_junior_declaration_test.sql"
  "$TEST_DIR/myk9_854_dogs_select_show_scoped_secretary_test.sql"
  "$TEST_DIR/dogs_update_secretary_created_dogs_test.sql"
  "$TEST_DIR/people_update_secretary_created_people_test.sql"
  "$TEST_DIR/office_admin_rls_test.sql"
  "$TEST_DIR/one_registry_per_show_test.sql"
  "$TEST_DIR/myk9_1008_show_requires_club_test.sql"
  "$TEST_DIR/cross_club_policy_authorization_test.sql"
  "$TEST_DIR/entry_status_history_rls_test.sql"
  "$TEST_DIR/move_up_supersession_test.sql"
  "$TEST_DIR/myk9_639_payment_link_order_owner_read_test.sql"
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
  "$TEST_DIR/myk9_740_ringside_replay_idempotent_test.sql"
  "$TEST_DIR/myk9_1086_ringside_update_class_test.sql"
  "$TEST_DIR/myk9_1098_ringside_update_class_area_times_test.sql"
  "$TEST_DIR/myk9_1513_class_ring_phase_test.sql"
  "$TEST_DIR/myk9_1625_ringside_class_num_areas_test.sql"
  "$TEST_DIR/myk9_677_show_payments_ledger_test.sql"
  "$TEST_DIR/myk9_677_submit_entries_payment_test.sql"
  "$TEST_DIR/myk9_773_inherited_refund_follows_payment_test.sql"
  "$TEST_DIR/myk9_773_online_paid_server_cascade_test.sql"
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
  "$TEST_DIR/myk9_1396_check_in_before_pull_trigger_test.sql"
  "$TEST_DIR/submit_entries_started_class_test.sql"
  "$TEST_DIR/submit_entries_day_of_show_flag_test.sql"
  "$TEST_DIR/sign_in_email_invariant_test.sql"
  "$TEST_DIR/myk9_710_people_identity_guard_test.sql"
  "$TEST_DIR/myk9_711_712_status_and_signup_grants_test.sql"
  "$TEST_DIR/myk9_660_667_manager_reads_catalog_writes_test.sql"
  "$TEST_DIR/myk9_664_people_private_test.sql"
  "$TEST_DIR/myk9_705_656_class_entry_availability_test.sql"
  "$TEST_DIR/myk9_753_class_judge_day_availability_test.sql"
  "$TEST_DIR/subscription_entitlement_grants_test.sql"
  "$TEST_DIR/support_triage_atomic_send_test.sql"
  "$TEST_DIR/support_ticket_creation_atomicity_test.sql"
  "$TEST_DIR/show_email_delivery_history_test.sql"
  "$TEST_DIR/soft_delete_dog_cascade_test.sql"
  "$TEST_DIR/force_delete_dog_test.sql"
  "$TEST_DIR/myk9_607_608_dog_delete_audit_restore_test.sql"
  "$TEST_DIR/crud_standard_soft_delete_restore_test.sql"
  "$TEST_DIR/crud_standard_delete_preview_test.sql"
  "$TEST_DIR/myk9_921_show_managed_person_deleted_by_test.sql"
  "$TEST_DIR/myk9_934_person_delete_self_or_admin_test.sql"
  "$TEST_DIR/myk9_946_create_dog_ownership_test.sql"
  "$TEST_DIR/myk9_876_874_refund_request_claims_test.sql"
  "$TEST_DIR/myk9_981_closed_refund_request_releases_cart_test.sql"
  "$TEST_DIR/myk9_968_payment_link_offer_resolves_atomically_test.sql"
  "$TEST_DIR/myk9_1003_waitlist_auto_offer_test.sql"
  "$TEST_DIR/myk9_1460_timezone_names_snapshot_test.sql"
  "$TEST_DIR/myk9_1388_club_delete_deactivates_club_roles_test.sql"
  "$TEST_DIR/myk9_1000_count_live_waitlist_entries_test.sql"
  "$TEST_DIR/myk9_1001_waitlist_offer_withdrawn_test.sql"
  "$TEST_DIR/myk9_1002_waitlist_offer_message_deadline_test.sql"
  "$TEST_DIR/myk9_997_platform_income_club_funded_refunds_test.sql"
  "$TEST_DIR/myk9_941_dog_registrations_co_owner_writes_test.sql"
  "$TEST_DIR/myk9_923_entries_refuse_deleted_parent_test.sql"
  "$TEST_DIR/myk9_980_move_up_pending_and_reentry_test.sql"
  "$TEST_DIR/myk9_1265_change_class_check_in_test.sql"
  "$TEST_DIR/myk9_964_replayable_cart_fulfillment_test.sql"
  "$TEST_DIR/myk9_1012_hold_spots_at_pay_test.sql"
  "$TEST_DIR/myk9_1020_judge_day_in_ring_test.sql"
  "$TEST_DIR/myk9_1005_manager_judge_day_capacity_test.sql"
  "$TEST_DIR/myk9_1018_capacity_override_server_marker_test.sql"
  "$TEST_DIR/myk9_1019_show_wide_allow_waitlist_test.sql"
  "$TEST_DIR/myk9_1030_judge_sign_off_test.sql"
  "$TEST_DIR/myk9_1045_results_verified_test.sql"
  "$TEST_DIR/myk9_1059_creation_attribution_test.sql"
  "$TEST_DIR/myk9_1117_registration_date_test.sql"
  "$TEST_DIR/myk9_1151_merge_sibling_registrations_test.sql"
  "$TEST_DIR/myk9_1071_registration_people_versions_test.sql"
  "$TEST_DIR/myk9_963_unfulfilled_charge_refund_test.sql"
  "$TEST_DIR/myk9_969_results_privacy_test.sql"
  "$TEST_DIR/myk9_1369_entry_results_changed_since_test.sql"
  "$TEST_DIR/myk9_1476_caller_access_epoch_test.sql"
  "$TEST_DIR/myk9_1521_changed_since_caller_access_test.sql"
  "$TEST_DIR/myk9_1517_show_dogs_limited_view_test.sql"
  "$TEST_DIR/myk9_822_blocking_entries_rpc_test.sql"
  "$TEST_DIR/myk9_970_role_onboarding_test.sql"
  "$TEST_DIR/user_roles_show_manager_read_test.sql"
  "$TEST_DIR/myk9_1514_trials_auto_complete_stale_classes_test.sql"
  "$TEST_DIR/withdraw_own_entry_test.sql"
  "$TEST_DIR/withdraw_or_pull_own_entry_test.sql"
  "$TEST_DIR/myk9_778_no_owner_withdraw_after_show_completed_test.sql"
  "$TEST_DIR/myk9_719_scratch_requested_retired_test.sql"
  "$TEST_DIR/update_own_entry_jump_height_test.sql"
  "$TEST_DIR/myk9_995_my_entry_queue_places_test.sql"
  "$TEST_DIR/myk9_1048_submit_entries_next_run_order_test.sql"
  "$TEST_DIR/myk9_1010_owner_address_required_test.sql"
  "$TEST_DIR/myk9_1010_fill_entry_owner_address_test.sql"
  "$TEST_DIR/update_entry_handler_for_entry_management_test.sql"
  "$TEST_DIR/seed_demo_paid_stray_guard_test.sql"
  "$TEST_DIR/seed_demo_paid_stray_guard_scopes_test.sql"
  "$TEST_DIR/myk9_731_restore_show_day_fixture_test.sql"
  "$TEST_DIR/myk9_731_restore_show_day_fixture_containment_test.sql"
  "$TEST_DIR/myk9_1162_registry_identity_taken_test.sql"
  "$TEST_DIR/myk9_1162_held_entries_packet_test.sql"
  "$TEST_DIR/myk9_1162_held_entries_ringside_test.sql"
  "$TEST_DIR/myk9_1162_lifecycle_registration_number_needed_test.sql"
  "$TEST_DIR/myk9_1212_claim_registration_number_needed_job_test.sql"
  "$TEST_DIR/myk9_1208_step_up_reauth_test.sql"
  "$TEST_DIR/myk9_1235_club_registry_numbers_test.sql"
  "$TEST_DIR/myk9_1254_lifecycle_jobs_column_acl_test.sql"
  "$TEST_DIR/myk9_1310_approval_authorizes_club_test.sql"
  "$TEST_DIR/myk9_1315_club_awaiting_authorization_notice_test.sql"
  "$TEST_DIR/myk9_1395_club_awaiting_authorization_rate_limit_test.sql"
  "$TEST_DIR/myk9_1309_seed_fixture_functions_test.sql"
  "$TEST_DIR/myk9_1311_show_entry_counts_test.sql"
  "$TEST_DIR/myk9_1409_role_permission_rpcs_test.sql"
  "$TEST_DIR/myk9_1407_comp_keeps_paid_status_test.sql"
  "$TEST_DIR/myk9_1327_set_class_judge_test.sql"
  "$TEST_DIR/myk9_1327_one_judge_per_class_test.sql"
  "$TEST_DIR/myk9_1472_hard_delete_show_money_guards_test.sql"
  "$TEST_DIR/myk9_1473_coin_flip_tie_order_test.sql"
)

for test_file in "${TEST_FILES[@]}"; do
  if [ ! -f "$test_file" ]; then
    echo "FAIL: missing behavioral SQL test $test_file." >&2
    exit 1
  fi
  echo "── $(basename "$test_file") ──"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$test_file"
done

# MYK9-1472: two-session races against hard_delete_show's row locks, lock
# timeout, deadlock and FK-DDL ordering. The fake-psql contract test skips it.
if [ "${MYK9_SKIP_HARD_DELETE_CONCURRENCY:-0}" = "1" ]; then
  echo "SKIP: local hard-delete concurrency harness (source-contract test mode)"
else
  MYK9_BEHAVIORAL_SQL_DATABASE_URL="$DATABASE_URL" \
    bash "$REPO_ROOT/scripts/qa/hard-delete-show-concurrency.sh"
fi

echo "BEHAVIORAL SQL TESTS PASSED (${#TEST_FILES[@]} files)"
