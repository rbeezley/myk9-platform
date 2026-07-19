## 1. Shared Broadcast Contract

- [x] 1.1 Add failing unit tests for show-topic formatting, one-channel fan-out, unsubscribe cleanup, and minimal payload filtering.
- [x] 1.2 Implement the shared show-change subscription registry using one private Broadcast channel per show.
- [x] 1.3 **[ADDED]** Test channel errors and rapid unsubscribe/re-subscribe so asynchronous cleanup cannot remove a new channel generation.

## 2. Consumer Migration

- [x] 2.1 Convert show-live sync, at-show refresh, check-in invalidation, and TV display to the shared Broadcast registry while preserving their existing debounce and fallback behavior.
- [x] 2.2 Update focused tests for each converted hook, including channel failure, cleanup, and authoritative refresh assertions.
- [x] 2.3 Remove the unrelated all-entries listener from public Browse Shows while retaining its valid `shows` subscription.

## 3. Notification Delivery

- [x] 3.1 Add failing tests proving a show-change signal refetches the authorized notification snapshot and still delivers current dogs-ahead, class-starting, check-in, and released-results notifications without row payloads.
- [x] 3.2 Refactor `useNotificationMonitor` to evaluate notifications from authoritative refreshed snapshots and subscribe through the shared registry.
- [x] 3.3 **[ADDED]** Coalesce notification bursts and test one trailing refetch when signals arrive during an in-flight request.

## 4. Consolidation

- [x] 4.1 Remove zero-consumer `useClassRealtime`, legacy `RealtimeManager`, and the unused generic Postgres Changes subscription helper plus their exports/tests.
- [x] 4.2 Audit surviving `postgres_changes` call sites and confirm only `shows`, `show_announcements`, and `show_messages` consumers remain.

## 5. Database Migration

- [x] 5.1 Add assertion-first SQL contract tests for minimal show-scoped signals, dual old/new routing, non-blocking trigger failure, private-topic policy shape, trigger coverage, and guarded publication removal.
- [x] 5.2 Add an idempotent migration that creates Broadcast authorization/function/triggers and removes `entries`, `classes`, and `show_message_threads` from `supabase_realtime`.
- [x] 5.3 Run Supabase migration lint/dry-run checks that do not mutate the linked project; record the real staging push as an owner-approval gate. Dry-run passed; linked-schema lint surfaced three unrelated pre-existing function errors.
- [x] 5.4 **[ADDED]** Document explicit corrective rollback SQL and a repeatable before/after workload for Realtime execution, event volume, and lag evidence.

## 6. Verification

- [x] 6.1 Run all focused Vitest files for the registry, notification monitor, converted hooks, TV display, and SQL contract.
- [x] 6.2 Run myK9Show typecheck and the narrowest relevant package/app lint or build checks; stop any hung suite after 60 seconds. Full monorepo typecheck/lint, scoped lint, and Ringside typecheck pass; the broad app suite showed no failures before the mandatory 60-second stop.
- [x] 6.3 Run `pnpm openspec validate migrate-showday-realtime-to-broadcast --type change --strict --no-interactive` and verify the implementation against every spec scenario.
- [x] 6.4 Review the final diff for unrelated changes, files over 500 lines, leaked row payloads, and offline-first regressions.

## 7. Shipping and Tracking

- [ ] 7.1 With owner approval, commit and push the feature branch, open the PR using the repository template, and record `Tracked in openspec change: migrate-showday-realtime-to-broadcast`.
- [ ] 7.2 Run required CI and second-opinion migration/security review; resolve actionable findings before merge.
- [ ] 7.3 After approved staging DB push, record publication/trigger/policy membership, two-context live-delivery evidence, and the repeatable before/after Realtime load observation.
- [ ] 7.4 After merge and evidence completion, post the implementation/test/PR/risk summary to MYK9-25, move it to Done, archive the OpenSpec change, and clean up the branch/worktree.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This cross-cutting change includes a database trigger, private Realtime authorization, offline/show-day data freshness, and shared client infrastructure used by multiple roles.
