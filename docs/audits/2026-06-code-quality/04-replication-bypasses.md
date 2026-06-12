# 04 Replication-Layer Bypasses

Finder: subagent `019eb9d2-5b82-7af2-9a49-453d9efbfcac`
Status: Phase 1 inventory complete; P2 findings need independent verification before fix waves.

## Findings

| File:Line | Operation | Surface | Offline Required | Severity | Evidence | Verification | Proposed Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/myk9show/src/services/database/entries/secretary.ts:136` | read | Secretary Entry Management load | yes | P2 | `EntryManagementPage` -> `useEntryManagementData` -> `getEntriesForShow`; direct `entries` read drives secretary table. | finder-confirmed; Phase-2 pending | Route through replicated entries plus replicated dog/class/armband joins or adapter. |
| `apps/myk9show/src/services/database/entries/secretary.ts:288` | write | Secretary status change | yes | P2 | `useEntryManagementActions` -> `changeSecretaryEntryStatus` -> direct `entries.update`. | finder-confirmed; Phase-2 pending | Replace with replicated entry update, preserving audit log. |
| `apps/myk9show/src/services/database/entries/secretary.ts:318` | write | Secretary bulk status change | yes | P2 | Bulk path uses direct `entries.update(...).in(...)`. | finder-confirmed; Phase-2 pending | Queue replicated entry update per id. |
| `apps/myk9show/src/services/database/armbands/secretary.ts:47` | read | Manual armband assignment | yes | P2 | `setEntryArmband` looks up entry via PostGREST. | finder-confirmed; Phase-2 pending | Use replicated entry lookup. |
| `apps/myk9show/src/services/database/armbands/secretary.ts:61` | write | Manual armband assignment | yes | P2 | Direct `armbands.upsert`; replicated armband table exists. | finder-confirmed; Phase-2 pending | Use replicated armband mutations/conflict handling. |
| `apps/myk9show/src/services/database/armbands/secretary.ts:87` | write | Sync armband onto entries | yes | P2 | Direct `entries.update({ armband })`. | finder-confirmed; Phase-2 pending | Use replicated entry updates. |
| `apps/myk9show/src/services/database/armbands/secretary.ts:114` | read | Auto-assign armbands | yes | P2 | Direct read of unassigned entries in secretary workflow. | finder-confirmed; Phase-2 pending | Read replicated entries/armbands. |
| `apps/myk9show/src/services/database/armbands/secretary.ts:137` | write | Auto-assign armbands | yes | P2 | Direct `armbands.upsert` loop. | finder-confirmed; Phase-2 pending | Use replicated armband mutations. |
| `apps/myk9show/src/services/database/armbands/secretary.ts:154` | write | Auto-assign armbands | yes | P2 | Direct `entries.update({ armband })` loop. | finder-confirmed; Phase-2 pending | Queue replicated entry updates. |
| `apps/myk9show/src/services/database/day-of-operations/scratch.ts:38` | read | Day-of pull list | yes | P2 | `DayOfOperationsPage/useDayOfOperationsData` calls `getScratchableEntries`. | finder-confirmed; Phase-2 pending | Build from replicated entries/classes/dogs. |
| `apps/myk9show/src/services/database/day-of-operations/scratch.ts:91` | read | Pull Management processed pulls | unclear | P2 candidate | Pull list is show-day; refund/accounting fields are online-ish. | needs-human | Split local pull state from online refund metadata. |
| `apps/myk9show/src/services/database/day-of-operations/scratch.ts:153` | read | Pending pull requests | yes | P2 | `PullManagementTab` calls `getPendingScratchRequests`. | finder-confirmed; Phase-2 pending | Read pending request rows from replicated entries. |
| `apps/myk9show/src/services/database/day-of-operations/move-up.ts:156` | read | Day-of move-up eligible list | yes | P2 | `DayOfOperationsPage/useDayOfOperationsData` calls `getMoveUpEligibleEntries`. | finder-confirmed; Phase-2 pending | Use replicated entries/classes/dogs. |
| `apps/myk9show/src/services/database/day-of-operations/move-up.ts:209` | read | Pending move-up requests | yes | P2 | `MoveUpRequestsTab` calls `getPendingMoveUpRequests`. | finder-confirmed; Phase-2 pending | Use replicated entries/classes/dogs. |
| `apps/myk9show/src/hooks/queries/useCheckInReport.ts:131` | read | Secretary check-in report | yes | P2 | `CheckInReportPage` uses report hook for show-day check-in state. | finder-confirmed; Phase-2 pending | Use replicated entries/classes/trials/armbands. |
| `apps/myk9show/src/hooks/queries/useShowDayData.ts:67`, `:90`, `:122` | read | Exhibitor show-day detection/detail/ring progress | yes | P2 | Hook comment says show-day detection and live ring progress; direct `entries` reads. | finder-confirmed; Phase-2 pending | Add replication-backed show-day data adapter. |
| `apps/myk9show/src/hooks/useClassEntries.ts:41` | read | Class entry live list | yes | P2 | Comment uses 30s polling for live show-day updates. | finder-confirmed; Phase-2 pending | Use replicated entries plus dog/person lookup. |
| `packages/ringside/src/pages/ClassList/hooks/useClassStatus.ts:146`, `:242` | write | Ringside class status | unclear | P2 candidate | Direct `classes.update`; package exported, but myK9Show `/at-show` may use host replicated actions. | needs-human | If public contract is live, inject replicated writer. |

## Refuted / Excluded

| File:Line | Candidate | Reason |
| --- | --- | --- |
| `day-of-operations/move-up.ts:31`, `:93` | Legacy move-up processor/insert | No live caller beyond same-file wrapper; superseded by replicated show-day request path. |
| `entries/lifecycle.ts:179` | Legacy day-of scratch write | Current day-of UI uses replicated scratch helper. |
| `entries/writes.ts:18` | Generic entry CRUD | Generic/setup/admin surface; show-day requirement not confirmed. |
| `shows/writes.ts:10` | Show setup/create | Pre-show setup/admin, not show-day offline operation. |
| `shows/reads.postgrest.ts` | Show reads fallback | Explicit `withReplicationFallback` exclusion. |

## Commands

Read-only commands included `rg "supabase\\.from\\("`, targeted `.from(...)` table scans for core tables, `withReplicationFallback` scans, INTENT scans, caller scans for secretary/day-of hooks, and read-only `sed`/`nl` inspections for line verification.
