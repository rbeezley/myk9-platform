# Offline Reliability Show-Day Remediation Plan

## Goal

Make the first secretary/show-day offline reliability slice releasable for fall 2026 launch readiness without expanding product surface area.

## Scope

- Fix check-in status writes that target `result_status` instead of `check_in_status`.
- Consolidate replicated check-in writes behind one small helper.
- Move the highest-traffic staff Show Map check-in action off direct Supabase writes.
- Replace the exhibitor self-check-in RPC with a narrow replication-backed mutation.

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
- [x] Add assertion-first tests for narrow replicated self/staff check-in mutation payloads.
- [x] Add a narrow replicated check-in status mutation to avoid broad-row/RLS drift.
- [x] Route exhibitor self check-in through the shared replicated check-in writer.
- [x] Route run-sheet store check-in through the narrow replicated mutation.
- [x] Route legacy Day-of Operations move-up dialog through replicated move-up mutations.
- [x] Route legacy Day-of Operations pull dialog/direct pull through replicated day-of scratch.
- [x] Route Day-of Operations walk-in entry row creation through replicated entries/classes.
- [x] Route mounted move-up/pull request approval and denial through replicated entry mutations.
- [x] Run focused self-check-in mutation tests, reliability slice tests, typecheck, lint, and diff checks.

## Deferred Follow-Ups

- `OfflineCheckInService` still keeps gate/check-in metadata locally; this slice migrates the durable check-in status write, but syncing gate/time/steward metadata needs a schema-backed design.
- Creating brand-new dog/person records from the day-of entry dialog remains online because it writes identity/profile data outside the entries/classes show-day replica contract.
- Refund processing/status remains online because it is payment/accounting state outside the durable show-day entry state.
- TV/public display reads remain direct Supabase and need an online-only vs offline-critical boundary decision.

## Testing

- Focused Vitest: 17 files / 196 tests covering check-in, request management, day-of entry creation, pull/move-up dialogs, Show Map mutations, offline check-in sync, result release, scoring mapper, replication tables, and entry store.
- `pnpm typecheck`
- `pnpm lint`
- `git diff --check`
- Targeted scan for active show-day `entries`/`classes` direct mutations, `self_checkin_entry`, `syncService.addToQueue`, and check-in/result-status drift.
