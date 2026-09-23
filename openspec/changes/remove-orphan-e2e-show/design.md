## Context

The published `f336...` show is outside the canonical seed and absent from its
reset scope. The title/UUID/MYK9-336 search across repository refs found audit
and credential references, but no creating test or recoverable creator. The
repository can therefore clean this exact known ID, while a future leak with a
different UUID remains an operational recurrence limitation.

## Goals / Non-Goals

**Goals:** document the unrecoverable creator search, keep the canonical seed
free of the orphan, provide deterministic owned-fixture teardown, and provide a
read-only preflight for the known ID. Task 1 limits the existing permanent-show
RPC to unused shows; Task 1b routes the application service through that RPC.

**Non-Goals:** execute a shared-database deletion from this branch, broadly
delete all non-seed published shows, or add a cleanup UI. This has no
offline/replication product-path impact.

## Decisions

- Prefer explicit fixture-ID lifecycle cleanup over name-pattern deletion. IDs
  are stable and do not risk deleting a legitimate show with similar text.
- Never run the orphan cleanup from the canonical seed or an automatic E2E
  lifecycle. The operator artifact is a read-only preflight: it never invokes a
  mutation and has no confirmation variable. Any shared cleanup remains a
  separate, explicitly approved operation after merge.
- Permanent deletion is for unused shows only. Any enrollment or entry blocks,
  regardless of payment state. Any other retained FK child also blocks, including
  `ON DELETE SET NULL` rows; losing their show association is not acceptable.
- Only the structural `trials_show_id_fkey` and `classes_trial_id_fkey` edges
  may be deleted. The RPC compares its exact reviewed manifest to the live
  catalog before checking rows, so added, removed, retargeted, re-columned, or
  action-changed FKs fail closed even when their child tables are empty.
- Existing logical array/text associations are not a reason for global table
  locks: a show-scoped Stripe order or payment link is itself a retained FK
  child; an order's refunds remain attached to that order; a payment-intent
  reference to a target entry is covered because every entry blocks deletion.
  This was cross-checked in the former migration body for
  `stripe_orders.entry_ids`, `entry_payment_links.entry_ids`, and
  `stripe_order_refunds.stripe_payment_intent_id`. No order, link, or refund
  table is deleted by the RPC.
- A direct DELETE on `shows` is not part of the product workflow. Drop
  `shows_delete` and revoke table DELETE from `PUBLIC`, `anon`, and
  `authenticated`; preserve owner/`service_role` maintenance access and the
  authenticated RPC grant with its in-function site-admin check. PostgreSQL has
  no column-level DELETE privilege, so the table-level revoke closes the only
  such grant surface; unrelated column grants are not broadly revoked.
- The user-facing Show Details action remains the existing permanent-delete
  surface. Club admins retain soft-delete and ordinary show management but do
  not gain permanent deletion.

## Task 1: Applied FK Inventory and Dispositions

The applied graph was queried read-only from the linked Supabase project in this
worktree, using `pg_catalog.pg_constraint`, `pg_get_constraintdef`, and the
referenced relations `public.shows`, `public.trials`, and `public.classes`.
Every returned edge was a single-column FK. The successful catalog output
identified 61 edges: 8 to `classes`, 39 to `shows`, and 14 to `trials`. An
independent expanded-column retry during implementation failed while
initializing the CLI login role (`LegacyDbConfigLoginRoleNetworkError:
TransportError`); the inventory below uses the successful read-only catalog
result, not source grep. The migration rechecks this exact identity and action
set in the deployed database.

| Constraint                                    | Child column → parent column                           | Delete action | Disposition |
| --------------------------------------------- | ------------------------------------------------------ | ------------- | ----------- |
| `class_visibility_overrides_class_id_fkey`    | `class_visibility_overrides.class_id` → `classes.id`   | CASCADE       | retain      |
| `entries_class_id_fkey`                       | `entries.class_id` → `classes.id`                      | CASCADE       | retain      |
| `entry_cart_items_class_id_fkey`              | `entry_cart_items.class_id` → `classes.id`             | NO ACTION     | retain      |
| `judge_assignments_class_id_fkey`             | `judge_assignments.class_id` → `classes.id`            | CASCADE       | retain      |
| `paperwork_prints_class_id_fkey`              | `paperwork_prints.class_id` → `classes.id`             | CASCADE       | retain      |
| `show_incidents_class_id_fkey`                | `show_incidents.class_id` → `classes.id`               | SET NULL      | retain      |
| `volunteer_class_assignments_class_id_fkey`   | `volunteer_class_assignments.class_id` → `classes.id`  | CASCADE       | retain      |
| `waitlist_entries_class_id_fkey`              | `waitlist_entries.class_id` → `classes.id`             | CASCADE       | retain      |
| `announcements_show_id_fkey`                  | `announcements.show_id` → `shows.id`                   | CASCADE       | retain      |
| `armbands_show_id_fkey`                       | `armbands.show_id` → `shows.id`                        | CASCADE       | retain      |
| `calendar_feed_tokens_show_id_fkey`           | `calendar_feed_tokens.show_id` → `shows.id`            | CASCADE       | retain      |
| `dog_favorites_show_id_fkey`                  | `dog_favorites.show_id` → `shows.id`                   | CASCADE       | retain      |
| `email_log_show_id_fkey`                      | `email_log.show_id` → `shows.id`                       | SET NULL      | retain      |
| `registrations_show_id_fkey`                  | `enrollments.show_id` → `shows.id`                     | CASCADE       | retain      |
| `entries_show_id_fkey`                        | `entries.show_id` → `shows.id`                         | CASCADE       | retain      |
| `entry_carts_show_id_fkey`                    | `entry_carts.show_id` → `shows.id`                     | CASCADE       | retain      |
| `entry_payment_links_show_id_fkey`            | `entry_payment_links.show_id` → `shows.id`             | CASCADE       | retain      |
| `judge_assignments_show_id_fkey`              | `judge_assignments.show_id` → `shows.id`               | CASCADE       | retain      |
| `paperwork_prints_show_id_fkey`               | `paperwork_prints.show_id` → `shows.id`                | CASCADE       | retain      |
| `premium_generation_attempts_show_id_fkey`    | `premium_generation_attempts.show_id` → `shows.id`     | CASCADE       | retain      |
| `premium_generations_show_id_fkey`            | `premium_generations.show_id` → `shows.id`             | CASCADE       | retain      |
| `promo_codes_show_id_fkey`                    | `promo_codes.show_id` → `shows.id`                     | CASCADE       | retain      |
| `result_submissions_show_id_fkey`             | `result_submissions.show_id` → `shows.id`              | CASCADE       | retain      |
| `ringside_sessions_show_id_fkey`              | `ringside_sessions.show_id` → `shows.id`               | CASCADE       | retain      |
| `role_requests_show_id_fkey`                  | `role_requests.show_id` → `shows.id`                   | SET NULL      | retain      |
| `secretary_tasks_show_id_fkey`                | `secretary_tasks.show_id` → `shows.id`                 | SET NULL      | retain      |
| `show_announcements_show_id_fkey`             | `show_announcements.show_id` → `shows.id`              | CASCADE       | retain      |
| `show_eve_nudge_log_show_id_fkey`             | `show_eve_nudge_log.show_id` → `shows.id`              | CASCADE       | retain      |
| `show_incidents_show_id_fkey`                 | `show_incidents.show_id` → `shows.id`                  | CASCADE       | retain      |
| `show_lifecycle_email_jobs_show_id_fkey`      | `show_lifecycle_email_jobs.show_id` → `shows.id`       | CASCADE       | retain      |
| `show_lifecycle_email_steps_show_id_fkey`     | `show_lifecycle_email_steps.show_id` → `shows.id`      | CASCADE       | retain      |
| `show_message_threads_show_id_fkey`           | `show_message_threads.show_id` → `shows.id`            | CASCADE       | retain      |
| `show_messages_show_id_fkey`                  | `show_messages.show_id` → `shows.id`                   | CASCADE       | retain      |
| `show_money_locks_show_id_fkey`               | `show_money_locks.show_id` → `shows.id`                | CASCADE       | retain      |
| `show_officials_show_id_fkey`                 | `show_officials.show_id` → `shows.id`                  | CASCADE       | retain      |
| `show_passcodes_show_id_fkey`                 | `show_passcodes.show_id` → `shows.id`                  | CASCADE       | retain      |
| `show_payouts_show_id_fkey`                   | `show_payouts.show_id` → `shows.id`                    | CASCADE       | retain      |
| `show_visibility_settings_show_id_fkey`       | `show_visibility_settings.show_id` → `shows.id`        | CASCADE       | retain      |
| `stripe_orders_show_id_fkey`                  | `stripe_orders.show_id` → `shows.id`                   | RESTRICT      | retain      |
| `support_tickets_show_id_fkey`                | `support_tickets.show_id` → `shows.id`                 | SET NULL      | retain      |
| `trial_packet_generation_claims_show_id_fkey` | `trial_packet_generation_claims.show_id` → `shows.id`  | CASCADE       | retain      |
| `trial_packet_print_reminders_show_id_fkey`   | `trial_packet_print_reminders.show_id` → `shows.id`    | CASCADE       | retain      |
| `trial_packet_snapshots_show_id_fkey`         | `trial_packet_snapshots.show_id` → `shows.id`          | RESTRICT      | retain      |
| `trials_show_id_fkey`                         | `trials.show_id` → `shows.id`                          | CASCADE       | disposable  |
| `user_roles_show_id_fkey`                     | `user_roles.show_id` → `shows.id`                      | CASCADE       | retain      |
| `volunteer_general_assignments_show_id_fkey`  | `volunteer_general_assignments.show_id` → `shows.id`   | CASCADE       | retain      |
| `volunteers_show_id_fkey`                     | `volunteers.show_id` → `shows.id`                      | CASCADE       | retain      |
| `activity_log_trial_id_fkey`                  | `activity_log.trial_id` → `trials.id`                  | CASCADE       | retain      |
| `announcements_trial_id_fkey`                 | `announcements.trial_id` → `trials.id`                 | CASCADE       | retain      |
| `armbands_trial_id_fkey`                      | `armbands.trial_id` → `trials.id`                      | CASCADE       | retain      |
| `classes_trial_id_fkey`                       | `classes.trial_id` → `trials.id`                       | CASCADE       | disposable  |
| `entries_trial_id_fkey`                       | `entries.trial_id` → `trials.id`                       | CASCADE       | retain      |
| `judge_assignments_trial_id_fkey`             | `judge_assignments.trial_id` → `trials.id`             | CASCADE       | retain      |
| `paperwork_prints_trial_id_fkey`              | `paperwork_prints.trial_id` → `trials.id`              | CASCADE       | retain      |
| `promo_codes_trial_id_fkey`                   | `promo_codes.trial_id` → `trials.id`                   | CASCADE       | retain      |
| `result_submissions_trial_id_fkey`            | `result_submissions.trial_id` → `trials.id`            | CASCADE       | retain      |
| `show_incidents_trial_id_fkey`                | `show_incidents.trial_id` → `trials.id`                | SET NULL      | retain      |
| `trial_checklist_state_trial_id_fkey`         | `trial_checklist_state.trial_id` → `trials.id`         | CASCADE       | retain      |
| `trial_judge_supplies_trial_id_fkey`          | `trial_judge_supplies.trial_id` → `trials.id`          | CASCADE       | retain      |
| `trial_visibility_overrides_trial_id_fkey`    | `trial_visibility_overrides.trial_id` → `trials.id`    | CASCADE       | retain      |
| `volunteer_general_assignments_trial_id_fkey` | `volunteer_general_assignments.trial_id` → `trials.id` | CASCADE       | retain      |

## Eligibility and Concurrency

The RPC retains its signature, `SECURITY DEFINER`, empty `search_path`, fully
qualified references, in-function site-admin check, authenticated execute grant,
and `42501`/`23503`/`55P03` error contract. It checks the FK manifest, locks the
target show then target trials and classes in ID order, and rejects every
enrollment or entry reached through show, trial, class, or enrollment ownership
before any delete. Cross-show entries that point into the target are an explicit
refusal. Each retained FK edge gets a dynamic existence check; only identifiers
from the reviewed manifest are inserted into SQL through `%I`, with the show ID
bound by `USING`. It deletes only classes, trials, then the exact show.

The show/trial/class `FOR UPDATE` locks conflict with FK-backed child inserts
and updates, preventing an otherwise-unused decision from racing a new
enrollment or entry. A two-second transaction-local lock timeout fails closed
with `55P03` and operator-only retry guidance. The app never retries. The prior
global locks on `stripe_orders`, `entry_payment_links`, and
`stripe_order_refunds` are removed; those payment associations cannot make an
eligible show disposable and are covered through their target-owned FK child or
entry.

The local two-session harness holds an uncommitted enrollment insert, then an
uncommitted cross-show entry targeting a target class. In both cases deletion
must time out with the show intact; after writer commit, an authenticated
site-admin operator retry must refuse the now-populated target with `23503`.
The runner's exact loopback URL guard remains mandatory. This harness is
source-checked here but requires a migrated local database for behavioral
execution.

## Test-fixture and Operator Flow

The SQL fixture includes a sparse show with trials/classes as the only successful
case; independent unpaid enrollment/entry, status history, result submission,
activity log, payout, print, incident, packet snapshot/claim, and email fixtures
must refuse while their records survive. Separate cross-show entry and
result-submission fixtures cover target class/trial references. An empty new FK
table demonstrates that unclassified catalog edges refuse before deletion.
The direct authenticated club-admin DELETE assertion changes from a positive
control to permission denial; the separate `soft_delete_show` authorization
test remains the legitimate club-admin path.

The E2E owned-show helper records exact created IDs and calls the same RPC-backed
service for cleanup. If a fixture unexpectedly has entries or durable evidence,
teardown reports the show ID and refusal instead of bypassing the rule. The
one-time artifact for `f3360000-0000-0000-0000-000000000001` remains read-only.

## Verification and Non-Goals

This task does not delete a populated show, create a new admin UI, run cleanup
from the seed or CI, infer the missing creator of the known orphan, or deploy or
push a migration without separate approval. The migration was not applied to a
shared database. The linked database's migration history and `origin/main` were
checked by the task owner at a point in time and did not contain this migration
version; recheck both before any future push. Behavioral SQL and concurrency
checks still require an available migrated local database.
