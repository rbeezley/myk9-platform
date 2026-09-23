# MYK9-615: unused-show permanent deletion

## Decision and purpose

Permanent deletion is for unused shows only. A show with participants, financial activity, submissions, or durable operational evidence must remain available for retention and reconciliation. This rule lets E2E CRUD tests remove their exact, sparse fixtures without turning the site-admin delete action into a general-purpose eraser of show history.

This design replaces the broad payment-and-audit guard approach in the unpushed MYK9-615 migration. Two adversarial reviews found that its denylist still cascaded `entry_status_history`, `result_submissions`, and `activity_log`. Adding more individual guards would repeat the same failure mode. The user selected the unused-show boundary on 2026-09-22.

## Eligibility and retained data

The existing `public.hard_delete_show(uuid)` RPC remains the only supported permanent-delete operation. It accepts a show only when all of these conditions hold in its deletion transaction:

1. The caller is a site administrator, and the exact show exists.
2. No enrollment belongs to the show. No entry names the show or any of its trials, classes, or enrollments, including cross-show links.
3. No financial, checkout, payout, packet, submission, print, incident, status-history, activity, email-delivery, or other durable record is attached to the show or its descendants.
4. Every relation that a show/trial/class delete could affect has an explicit, reviewed disposition. An unclassified relation blocks deletion even when it currently has no rows.

Trials and classes are structural descendants and may be deleted with an otherwise unused show. All other relations default to **retain/block**. A relation can become disposable only through a reviewed allowlist update that explains why its rows are not participant, financial, delivery, or audit evidence. `ON DELETE SET NULL` is not automatically safe: losing the show association can destroy useful context, so those relations also require a disposition. No fixture name, published status, or age waives these checks.

The initial retention decision is conservative. `entry_status_history`, `result_submissions` XML/status, `activity_log`, `show_payouts`, `paperwork_prints` (including voided confirmations), `show_incidents`, packet snapshots and generation claims, Stripe orders/refunds/payment links, and `email_log` block deletion. Entries and enrollments block regardless of payment status. A successful SQL fixture contains a show with trials/classes but none of those records; it must not insert history and call it “zero evidence.”

## Fail-closed schema boundary

A reviewed manifest records each foreign-key relation reachable from `shows`, `trials`, and `classes`, its delete action, and its disposition. The RPC checks the current database catalog against that manifest before deleting. A new or changed `CASCADE` or `SET NULL` relation that is absent from the manifest stops deletion; the operator receives a non-destructive refusal naming the unclassified relation. A migrated-database CI test compares the same catalog graph with the manifest so schema additions fail before release. The catalog check protects a deployed database even if a migration or schema drift reaches it before CI catches up.

For classified retained relations, the RPC checks for target-owned rows and refuses when present. For classified disposable relations, it deletes only rows reached from the exact target show through the existing FK-safe sequence. The manifest is an allowlist of what may be affected, not a list of records to ignore. It never authorizes a name-pattern or “all non-seed shows” sweep.

This boundary covers declared database relationships. Known logical links without foreign keys are checked explicitly; an unknown text/array convention cannot be inferred from `pg_constraint`, so any new logical association requires a reviewed manifest and regression-test update before it can be used by a deletable show.

## Authorization and concurrency

The RPC keeps its `SECURITY DEFINER`, empty `search_path`, schema-qualified references, in-function site-admin check, explicit `EXECUTE` grant to `authenticated`, and revoke from `PUBLIC` and `anon`. The existing app `hardDeleteShow` service and Show Details action both call this RPC. To prevent a bypass, the design removes direct `DELETE` on `public.shows` from `PUBLIC`, `anon`, and `authenticated`, checks table- and column-level grants on the applied database, and removes the club-admin `shows_delete` policy. Club admins keep the existing soft-delete and ordinary show-management paths; they do not gain permanent deletion. `service_role` and the database owner retain their maintenance privileges. The existing positive-control test that expects club-admin direct DELETE must change to assert refusal instead.

The RPC locks the target show, then its trials and classes in stable ID order, before checking eligibility. These row locks block new FK-backed entries, enrollments, and other descendants from appearing between the empty-show check and deletion. Because an eligible show has no entry or enrollment IDs to target, the prior three global payment-association table locks are unnecessary and are removed. A short lock timeout fails closed with operator-only retry guidance; the app never retries deletion automatically. The transaction either deletes the exact eligible show or leaves all rows intact.

## Test-fixture and operator flow

The E2E owned-show helper records exact created IDs before later assertions can fail, observes GUI creation at the successful POST response, and attempts cleanup for every recorded ID. It calls the same RPC-backed service. If a fixture unexpectedly has entries or durable evidence, teardown reports the show ID and refusal instead of bypassing the rule. The targeted CRUD suites create only shows, trials, and classes; their cleanup is the successful path. Populated-show E2E data needs isolated test infrastructure or a separate retention decision, not a wider production delete RPC.

The one-time artifact for `f3360000-0000-0000-0000-000000000001` remains read-only. It prints exact identity, sibling inventory, and every eligibility signal. After merge and an explicitly approved shared-system operation, an operator may use the existing site-admin Show Details action only if the RPC confirms eligibility. If it refuses, stop; do not edit the seed, weaken the RPC, or run hand-written child deletes. The actual cleanup, reseed, and post-cleanup evidence remain separate approval gates.

## Verification and non-goals

Tests must cover a genuinely unused show with trials/classes; each retained-record class; an unclassified FK relation; direct authenticated DELETE refusal; non-admin RPC refusal; and two-session races for new entry/enrollment insertion and target-row updates while deletion waits. Source-level tests alone do not establish database behavior. Run behavioral SQL and concurrency tests against a migrated local database in CI, plus focused app service and E2E lifecycle tests. Confirm the migration version against `origin/main` and the linked database before any push; do not claim clearance when the linked inventory is unavailable.

This change does not delete a populated show, create a new admin UI, run cleanup from the seed or CI, infer the missing creator of the known orphan, or deploy/push a migration without separate approval. It does not promise that every future E2E test using populated shows can hard-delete its data.
