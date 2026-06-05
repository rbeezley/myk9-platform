# Offline Reliability Show-Day Remediation Plan

## Goal

Make the first secretary/show-day offline reliability slice releasable for fall 2026 launch readiness without expanding product surface area.

## Scope

- Fix check-in status writes that target `result_status` instead of `check_in_status`.
- Consolidate replicated check-in writes behind one small helper.
- Move the highest-traffic staff Show Map check-in action off direct Supabase writes.
- Keep exhibitor self check-in on the owner-scoped `self_checkin_entry` RPC because
  migration `20260604004045_restrict_entries_update_to_managers.sql` makes direct
  `entries` UPDATE manager-only; staff check-in uses the narrow replicated writer.

## Tasks

- [x] Add assertion-first tests for the check-in write payload and staff callers.
- [x] Add a shared replicated check-in status writer.
- [x] Route Result Entry Navigation check-in updates through the shared writer.
- [x] Route Show Map staff check-in through the shared writer.
- [x] Reuse the shared writer in at-show entry list actions.
- [x] Run focused tests for the touched areas.

## Continued Pre-PR Tasks

- [x] Add assertion-first tests for `CheckInReportPage` single and bulk staff check-in.
- [x] Route `CheckInReportPage` staff check-in through the shared replicated writer.
- [x] Run focused page/helper tests, typecheck, and focused lint.
- [x] Add assertion-first test for `OfflineCheckInService` online sync.
- [x] Route `OfflineCheckInService` sync through the shared replicated writer instead of deprecated `syncService`.
- [x] Run focused offline check-in tests and reliability slice tests.
- [x] Add assertion-first tests for Show Map day-of scratch/no-show replication.
- [x] Add replicated entry support for `withdrawal_reason`.
- [x] Route Show Map scratch/no-show through replication instead of online lifecycle service.
- [x] Run focused scratch/no-show tests and reliability slice tests.
- [x] Add assertion-first tests for Show Map move-up/undo replication.
- [x] Route Show Map move-up/undo through replicated entries/classes instead of online day-of services.
- [x] Run focused Show Map UI tests and reliability slice tests.
- [x] Add assertion-first test for scoring mapper check-in column source.
- [x] Route scoring mapper check-in state through `check_in_status`, not `result_status`.
- [x] Add assertion-first test for manual results release replication.
- [x] Route manual results release through replicated class updates.
- [x] Add assertion-first tests for narrow replicated staff check-in mutation payloads.
- [x] Add a narrow replicated check-in status mutation to avoid broad-row/RLS drift.
- [x] Route exhibitor self check-in through the owner-scoped RPC writer.
- [x] Route run-sheet store check-in through the narrow replicated mutation.
- [x] Route legacy Day-of Operations move-up dialog through replicated move-up mutations.
- [x] Route legacy Day-of Operations pull dialog/direct pull through replicated day-of scratch.
- [x] Route Day-of Operations walk-in entry row creation through replicated entries/classes.
- [x] Route mounted move-up/pull request approval and denial through replicated entry mutations.
- [x] Run focused self-check-in mutation tests, reliability slice tests, typecheck, lint, and diff checks.

## PR Review Follow-Ups

- [x] Restore exhibitor self check-in to the `self_checkin_entry` RPC boundary and keep staff/scoring flows on the replicated writer.
- [x] Add regression coverage proving `MyEntriesPage` opts into the RPC writer.
- [x] Add regression coverage proving exhibitor `ClassResultsTable` check-in opts into the RPC writer.
- [x] Restore audit trail entries for replicated day-of scratch, move-up, undo, and request denial/approval transitions.
- [x] Restore stale request guards before replicated move-up/pull approve/deny actions.
- [x] Document accepted local-replica trade-offs for move-up capacity checks, walk-in armband assignment, and bulk results release.

## Deferred Follow-Ups

- `OfflineCheckInService` still keeps gate/check-in metadata locally; this slice migrates the durable check-in status write, but syncing gate/time/steward metadata needs a schema-backed design.
- Creating brand-new dog/person records from the day-of entry dialog remains online because it writes identity/profile data outside the entries/classes show-day replica contract.
- Refund processing/status remains online because it is payment/accounting state outside the durable show-day entry state.
- TV/public display reads remain direct Supabase and need an online-only vs offline-critical boundary decision.
- Move-up capacity checks and day-of walk-in armband assignment now use the local entries replica. That is necessary for offline operation but can under-count on incomplete replicas or concurrent devices; launch readiness still needs a reconciliation/backstop design.
- Manual results release queues one class update per selected class; a local partial failure can leave a mixed release state until the secretary retries the failed class selection.
- Legacy direct Supabase lifecycle/day-of operation modules are no longer mounted by the migrated surfaces but are still exported for compatibility. Delete them in a consolidation PR after this reliability PR lands and any external references are confirmed absent.

## Testing

- Focused Vitest: 19 files / 222 tests covering check-in, request management, day-of entry creation, pull/move-up dialogs, Show Map mutations, exhibitor self check-in, ClassResultsTable check-in writer selection, offline check-in sync, result release, scoring mapper, replication tables, and entry store.
- `pnpm typecheck`
- `pnpm lint`
- `git diff --check`
- Targeted scan for active show-day `entries`/`classes` direct mutations, `self_checkin_entry`, `syncService.addToQueue`, and check-in/result-status drift.
