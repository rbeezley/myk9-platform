# SA-027 — accepted `SECURITY DEFINER` search-path dependency

**Decision:** Accept the legacy dependency pending incremental conversion.

**Owner:** Richard Beezley, myK9 platform security owner (Linear: MYK9-151).

## Scope

The following 21 surviving `public` `SECURITY DEFINER` functions were identified
in the 2026-07-29 applied catalog review as using a non-empty path containing
`public`. They remain covered by this decision until an owner-approved migration
converts each body to `SET search_path = ''` with fully qualified references.

| Function identity                                       | Current disposition                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `assert_active_waitlist_offer_payment_link()`           | Accepted dependency; convert when next edited                                                                               |
| `check_class_availability(uuid)`                        | Accepted dependency; convert when next edited                                                                               |
| `check_login_rate_limit(text)`                          | Accepted dependency; convert when next edited                                                                               |
| `get_admin_user_list(boolean)`                          | Accepted dependency; convert when next edited                                                                               |
| `get_my_onboarding_requests()`                          | Accepted dependency; convert when next edited                                                                               |
| `handle_entry_scoring_state_change()`                   | Accepted dependency; convert when next edited                                                                               |
| `hard_delete_show(uuid)`                                | Accepted dependency; convert when next edited                                                                               |
| `promote_waitlist_entry(uuid, integer)`                 | Accepted dependency; convert when next edited                                                                               |
| `promote_waitlist_entry_from_cron(uuid)`                | Accepted dependency; convert when next edited                                                                               |
| `promote_waitlist_entry_internal(uuid, integer)`        | Accepted dependency; convert when next edited                                                                               |
| `recalculate_class_placements(uuid[], boolean)`         | **Converted** to `SET search_path = ''` by `20260817120000_placement_ranking_ignores_soft_deleted_entries.sql` (2026-08-17) |
| `record_entry_status_history()`                         | Accepted dependency; convert when next edited                                                                               |
| `record_login_attempt(text, boolean, text, uuid, text)` | Accepted dependency; convert when next edited                                                                               |
| `refresh_class_scoring_state(uuid)`                     | **Converted** to `SET search_path = ''` by `20260817140000_clear_placement_on_soft_deleted_entries.sql` (2026-08-17)        |
| `resolve_class_result_visibility(uuid)`                 | Accepted dependency; convert when next edited                                                                               |
| `restrict_payment_status_update()`                      | Accepted dependency; convert when next edited                                                                               |
| `restrict_subscription_column_updates()`                | Accepted dependency; convert when next edited                                                                               |
| `soft_delete_class(uuid)`                               | Accepted dependency; convert when next edited                                                                               |
| `soft_delete_dog(uuid)`                                 | Accepted dependency; convert when next edited                                                                               |
| `soft_delete_show(uuid)`                                | Accepted dependency; convert when next edited                                                                               |
| `update_thread_last_message_at()`                       | Accepted dependency; convert when next edited                                                                               |

The repository-wide SECURITY DEFINER grant inventory remains the source for
function callers and execute-role dispositions:
[`definer-function-inventory.md`](../audits/2026-07-go-live-advisors/definer-function-inventory.md).

## Why this is accepted

Applied evidence shows `anon`, `authenticated`, and `service_role` cannot create
objects in `public`, so a client cannot currently place a shadow object there.
The functions are not being bulk-rewritten because qualifying every historical
body and preserving its authorized positive/negative behavior requires a separate,
owner-approved hardening batch.

## Monitoring contract

- Migration `20260804160000_public_schema_create_acl_probe.sql` exposes a
  service-role-only, read-only probe of `CREATE` on `public` for all three API
  roles.
- The daily `cron-health-check` calls the probe and records
  `public_schema_create_acl` in `system_health_snapshots`.
- Any positive `can_create` result is a failing health check and must reopen
  MYK9-151 or trigger immediate ACL remediation.
- The source contract test must keep the probe locked to `search_path = ''`,
  revoked from `PUBLIC`, and granted only to `service_role`.
- New or edited SECURITY DEFINER functions must use empty search paths and fully
  qualified references; they must not add to this accepted inventory.

Closure still requires an applied probe result showing no violations. This
document is the accepted-risk decision, not that applied evidence.
