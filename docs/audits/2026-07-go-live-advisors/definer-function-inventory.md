# SECURITY DEFINER function inventory — task 9.2

> Batch B, `go-live-2026-07-11-gate-remediation`. Source: live `pg_proc`/`proacl` snapshot (2026-07-13, read-only) + repo call-site grep. Machine-readable twin: `definer-function-inventory.json`.

## Summary

| Disposition | Count |
| --- | --- |
| Total | 136 |
| service-only | 58 |
| authenticated | 67 |
| unconfident | 1 |
| anon-preserving | 10 |

All 136 live `public` SECURITY DEFINER functions carry an explicit ACL — the Postgres default `PUBLIC` EXECUTE grant is already displaced on every one (verified against `proacl`). The draft migration pins that state with explicit signature-specific `REVOKE ... FROM PUBLIC` plus narrow restore grants.

Ringside note: passcode ringside sessions authenticate via Supabase anonymous sign-in and carry the `authenticated` JWT role. The true `anon` grants below serve unauthenticated public reads (results visibility, RLS helper predicates on anon-readable tables) and are preserved.

## Unconfident (excluded from draft migration — need human disposition)

- `public.get_license_key()` — live authenticated grant but no repo call site (rpc/policy/trigger/SQL) found; possible legacy myK9Q licensing path — needs human disposition

## Inventory

| Function | Trigger | RPC callers (app/edge) | RLS policies | Current grants | Desired roles | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| `_account_ringside_show_id(text)` |  | 3 |  | service_role, authenticated | service_role | service-only |
| `_can_manage_show_passcodes(uuid)` |  | 0 |  | service_role, authenticated | service_role | service-only |
| `_generate_unique_role_code(text)` |  | 0 |  | service_role, authenticated | service_role | service-only |
| `_hash_passcode(text)` |  | 1 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `_random_role_code(text)` |  | 0 |  | service_role, authenticated | service_role | service-only |
| `approve_role_request(uuid, uuid, uuid, text)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `assign_armband(uuid, uuid)` |  | 8 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `audit_cron_vault_secrets()` |  | 1 |  | service_role | service_role | service-only |
| `can_manage_show(uuid)` |  | 4 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `can_manage_show_dog(uuid)` |  | 0 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `can_manage_show_lifecycle_email(uuid)` |  | 0 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `can_manage_show_person(uuid)` |  | 1 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `can_manage_show_person_for_show(uuid, uuid)` |  | 1 |  | service_role, authenticated | service_role | service-only |
| `can_manage_trial(uuid)` |  | 3 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `cart_item_identity_change_sever_session()` | yes | 0 |  | service_role | service_role | service-only |
| `check_and_record_premium_generation_attempt(uuid, uuid)` |  | 3 |  | service_role | service_role | service-only |
| `check_class_availability(uuid)` |  | 2 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `check_login_rate_limit(text)` |  | 4 |  | service_role | service_role | service-only |
| `cleanup_stale_ringside_anon_users(interval, interval, interval)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `clear_ringside_session_presence(text, uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `create_dog_with_registrations(jsonb, jsonb)` |  | 6 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamp with time zone, uuid, uuid, uuid)` |  | 3 |  | service_role | service_role | service-only |
| `create_or_reuse_club(jsonb)` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `create_show_managed_dog(uuid, uuid, text, text, text, text, text, text, text)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `create_show_managed_person(uuid, text, text, text, text)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `create_show_with_children(jsonb, jsonb, jsonb, uuid[])` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `delete_show_managed_person(uuid, uuid)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `deny_role_request(uuid, text)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `ensure_show_lifecycle_email_steps(uuid)` |  | 0 |  | service_role, authenticated | service_role | service-only |
| `ensure_show_lifecycle_email_steps_for_new_show()` | yes | 0 |  | service_role | service_role | service-only |
| `entries_protect_payment_fields()` | yes | 0 |  | service_role | service_role | service-only |
| `entries_protect_payment_fields_insert()` | yes | 0 |  | service_role | service_role | service-only |
| `entries_protect_payment_status()` | yes | 0 |  | service_role | service_role | service-only |
| `entry_cart_items_protect_cart_id()` | yes | 0 |  | service_role | service_role | service-only |
| `entry_carts_protect_session_id()` | yes | 0 |  | service_role | service_role | service-only |
| `entry_carts_protect_status()` | yes | 0 |  | service_role | service_role | service-only |
| `evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)` |  | 1 |  | service_role | service_role | service-only |
| `get_account_today_entries()` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_admin_user_list(boolean)` |  | 2 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_club_show_manager_ids(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_deleted_classes()` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_deleted_dogs()` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_deleted_people()` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_deleted_shows()` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_effective_permissions(uuid, text, uuid)` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_entries_for_export(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_judge_day_capacity(uuid, uuid, date)` |  | 1 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_judge_day_capacity_live(uuid, uuid, date)` |  | 0 |  | service_role | service_role | service-only |
| `get_license_key()` |  | 0 |  | service_role, authenticated | service_role | unconfident |
| `get_my_handled_dog_ids()` |  | 0 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `get_my_person_id()` |  | 2 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `get_show_officials(uuid)` |  | 6 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_user_permissions(uuid, text, uuid)` |  | 10 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `get_user_roles(uuid)` |  | 8 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `grant_club_admin_to_club_creator()` | yes | 0 |  | service_role | service_role | service-only |
| `grant_club_secretary(uuid, uuid)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `grant_show_official(uuid, text, uuid)` |  | 7 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `guard_platform_settings_write()` | yes | 0 |  | service_role | service_role | service-only |
| `handle_entry_scoring_state_change()` | yes | 0 |  | service_role | service_role | service-only |
| `handle_new_user()` | yes | 2 |  | service_role | service_role | service-only |
| `hard_delete_show(uuid)` |  | 2 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `has_role(text, uuid)` |  | 0 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `increment_promo_usage(uuid)` |  | 2 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `insert_club_access_request_from_signup(uuid, uuid, jsonb)` |  | 1 |  | service_role, supabase_auth_admin, authenticated | service_role, supabase_auth_admin, authenticated | authenticated |
| `insert_show_passcodes(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `insert_signup_role_requests(uuid, uuid, jsonb)` |  | 0 |  | service_role | service_role | service-only |
| `is_club_admin(uuid)` |  | 15 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `is_platform_admin()` |  | 4 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `is_show_manager()` |  | 0 | yes | service_role, authenticated | service_role, authenticated | authenticated |
| `is_show_official(uuid)` |  | 0 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `is_show_secretary(uuid)` |  | 13 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `is_show_secretary()` |  | 13 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `is_site_admin()` |  | 24 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `is_trial_secretary(uuid)` |  | 4 | yes | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `list_cron_vault_secret_refs()` |  | 1 |  | service_role | service_role | service-only |
| `materialize_club_access_request_from_auth_user()` | yes | 0 |  | service_role, supabase_auth_admin | service_role, supabase_auth_admin | service-only |
| `notify_announcement_push()` | yes | 1 |  | service_role | service_role | service-only |
| `notify_chat_message()` | yes | 0 |  | service_role | service_role | service-only |
| `notify_class_status_push()` | yes | 0 |  | service_role | service_role | service-only |
| `notify_entry_scoring_push()` | yes | 0 |  | service_role | service_role | service-only |
| `notify_support_message()` | yes | 1 |  | service_role | service_role | service-only |
| `notify_waitlist_invite()` | yes | 0 |  | service_role | service_role | service-only |
| `people_protect_early_adopter()` | yes | 0 |  | service_role | service_role | service-only |
| `people_protect_status()` | yes | 0 |  | service_role | service_role | service-only |
| `prevent_orphaning_dogs_on_person_delete()` | yes | 1 |  | service_role | service_role | service-only |
| `promote_waitlist_entry(uuid, integer)` |  | 6 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `promote_waitlist_entry_from_cron(uuid)` |  | 2 |  | service_role | service_role | service-only |
| `promote_waitlist_entry_internal(uuid, integer)` |  | 0 |  | service_role | service_role | service-only |
| `propagate_people_auth_user_id_to_user_roles()` | yes | 0 |  | service_role | service_role | service-only |
| `prune_premium_generation_attempts()` |  | 1 |  | service_role | service_role | service-only |
| `prune_stale_ringside_sessions()` |  | 0 |  | service_role | service_role | service-only |
| `recalculate_class_placements(uuid[], boolean)` |  | 1 |  | service_role | service_role | service-only |
| `record_login_attempt(text, boolean, text, uuid, text)` |  | 1 |  | service_role | service_role | service-only |
| `refresh_class_scoring_state(uuid)` |  | 2 |  | service_role | service_role | service-only |
| `refresh_class_scoring_state_authorized(uuid)` |  | 5 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `regenerate_show_passcodes(uuid)` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `resolve_class_result_visibility(uuid)` |  | 1 |  | service_role, authenticated, anon | service_role, authenticated, anon | anon-preserving |
| `resolve_operator_alert(uuid)` |  | 2 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `restore_class(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `restore_dog(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `restore_person(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `restore_show(uuid)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `restrict_entry_refund_columns()` | yes | 0 |  | service_role | service_role | service-only |
| `restrict_payment_status_update()` | yes | 0 |  | service_role | service_role | service-only |
| `restrict_subscription_column_updates()` | yes | 0 |  | service_role | service_role | service-only |
| `restrict_support_ticket_update_columns()` | yes | 1 |  | service_role | service_role | service-only |
| `review_club_access_request(uuid, text, uuid, text, text)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `revoke_club_secretary(uuid, uuid)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `ringside_claim_generation_current()` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `ringside_update_entry(uuid, jsonb, integer)` |  | 28 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `self_checkin_entry(uuid, text)` |  | 11 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `soft_delete_class(uuid)` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `soft_delete_dog(uuid)` |  | 8 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `soft_delete_person(uuid)` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `soft_delete_show(uuid)` |  | 8 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `stamp_entry_withdrawn_at()` | yes | 0 |  | service_role | service_role | service-only |
| `stamp_show_refund_entries(uuid[], text)` |  | 3 |  | service_role | service_role | service-only |
| `submit_club_access_request(text, text, text)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `submit_role_request(text, text, uuid, uuid, text)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `submit_show_entries(uuid, uuid, jsonb, uuid, text)` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `sync_dog_registration_deleted_marker()` | yes | 0 |  | service_role | service_role | service-only |
| `sync_dog_registration_deleted_markers_for_dog()` | yes | 0 |  | service_role | service_role | service-only |
| `sync_enrollment_on_payment_success()` | yes | 0 |  | service_role | service_role | service-only |
| `sync_user_roles_auth_user_id()` | yes | 0 |  | service_role | service_role | service-only |
| `system_health_probe()` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `test_as_anon()` |  | 0 |  | service_role | service_role | service-only |
| `test_as_user(uuid)` |  | 0 |  | service_role | service_role | service-only |
| `test_reset()` |  | 0 |  | service_role | service_role | service-only |
| `update_entry_handler(uuid, text)` |  | 0 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `update_entry_handler_for_entry_management(uuid, text, uuid, boolean)` |  | 3 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `update_thread_last_message_at()` | yes | 0 |  | service_role | service_role | service-only |
| `upsert_ringside_session(text, text, text[], text)` |  | 7 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `user_has_permission(uuid, text, text, uuid)` |  | 7 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `validate_passcode(text)` |  | 4 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `validate_promo_code(text, uuid, uuid)` |  | 6 |  | service_role, authenticated | service_role, authenticated | authenticated |
| `volunteer_show_id(uuid)` |  | 0 | yes | service_role, authenticated | service_role, authenticated | authenticated |
