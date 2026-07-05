# Replication OCC / Watermark Findings

> **Status:** Complete

## Re-check and UI Matrix Fold-in (2026-07-04)

This pass re-ran the Plan 005 investigation against current `main` and folded in
the UI verification matrix Criticals S1/S2. The original OCC spike is still
closed: PR #1098's fixes are present, and none of Leads A-E still requires a
replication-source follow-up. The remaining launch-reliability gap is the
entries read-path/operator-facing error behavior from S2.

Current drift check:
`git diff --stat 929240192..HEAD -- packages/replication` now shows package
changes in `MutationManager.ts`, `ReplicatedTable.ts`,
`syncReplicatedTable.test.ts`, and related OCC tests. That drift is the expected
PR #1098 fix set, so this re-check uses today's code, not the 2026-07-02
baseline.

### Current Verdicts

| Item | Current verdict | Evidence |
|------|-----------------|----------|
| Lead A - non-entry full-row UPDATE token/payload refresh | NOT A BUG (fixed) | Non-entry adapters now supply `rebuildUpdatePayload`, for example classes (`apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:310`, `:373`), dogs (`ReplicatedDogsTable.ts:124`, `:154`), shows (`ReplicatedShowsTable.ts:189`, `:222`), trials (`ReplicatedTrialsTable.ts:159`, `:189`), clubs (`ReplicatedClubsTable.ts:139`, `:168`), armbands (`ReplicatedArmbandsTable.ts:99`, `:147`), and judge assignments (`ReplicatedJudgeAssignmentsTable.ts:153`, `:194`). The queue still refuses to advance a full-row mutation without a rebuilt payload (`packages/replication/src/MutationManager.ts:331-343`), which is now the safe invariant. |
| Lead B - scoped/global watermark mixing | NOT A BUG | Scoped reads project `scopes[scopeValue]` and only `scopeValue === undefined` reads the table-global row (`packages/replication/src/core/ReplicatedTableCache.ts:390-410`). Scoped writes route watermarks into `scopes[scopeValue]` and only mirror a global informational watermark that scoped reads do not consult (`ReplicatedTableCache.ts:459-489`). Empty-string calls such as `replicatedClassesTable.sync('')` stay scoped because `'' !== undefined` (`apps/myk9show/src/components/trials/TrialDetail/TrialManagementDialogs.tsx:205-207`, `apps/myk9show/src/pages/ClassDetailsPage/index.tsx:139-141`). |
| Lead C - local INSERT with no base snapshot | NOT A BUG (pinned invariant) | A new dirty row has no base until a prior clean row exists (`packages/replication/src/core/ReplicatedTableRowState.ts:23-37`). The no-base dirty sync path deliberately avoids merge/token promotion (`packages/replication/src/syncReplicatedTable.ts:222-295`), and the package test pins that invariant: "preserves a locally-created dirty row without promoting the matching remote row to a base" (`packages/replication/src/syncReplicatedTable.test.ts:568-587`). |
| Lead D - server-added fields clobbered after keep-local | NOT A BUG (fixed) | The current dirty reconciliation path merges server-changed untouched fields (`packages/replication/src/conflict/detectDirtyRowConflict.ts:74-104`), advances the row base/token, and reconciles queued full-row payloads (`packages/replication/src/core/ReplicatedTable.ts:574-618`). Existing tests assert the server field is not clobbered and the queued payload is rebuilt (`packages/replication/src/syncReplicatedTable.test.ts:431-462`, `:589-620`). |
| Lead E - failed OCC re-check becomes row-deleted | NOT A BUG (fixed) | Direct UPDATE re-check errors are threaded into `classifyEmptyUpdateResult` (`packages/replication/src/MutationManager.ts:776-800`), and the classifier returns an RLS/auth error on failed re-check instead of row-deleted (`packages/replication/src/mutation-occ.ts:78-84`). Ringside RPC writes still avoid direct table re-check by carrying the current version in RPC conflict detail (`packages/replication/src/MutationManager.ts:736-754`; `supabase/migrations/20260625190000_ringside_update_entry_surface_conflict_version.sql:5-19`). |
| UI S1 - cold first paint shows false empty/error states | NOT A BUG for the named current at-show/My Entries surfaces | At-show class list, entry list, scoresheet, and My Entries now gate empty/error states on `areReplicationTablesPendingFirstSync` (`apps/myk9show/src/utils/replicationSyncEmptyState.ts:7-13`; `AtShowClassListPage.tsx:156-166`; `AtShowEntryListPage.tsx:136-141`; `useAtShowScoresheet.ts:68-120`; `MyEntriesPage/index.tsx:155-158`, `:306-318`). Targeted tests cover the former false-empty copy (`AtShowClassListPage.test.tsx:164-172`, `AtShowEntryListPage.test.tsx:131-141`, `AtShowScoresheetPage.test.tsx:166-176`). |
| UI S2 - entries read timeout + raw vendor toast | CONFIRMED follow-up | The secretary entry-management read first uses replicated data, but falls back to direct PostgREST when the local store is cold or the replicated read fails (`apps/myk9show/src/services/database/entries/secretary.ts:71-107`). That fallback still hits `entries` with a wide joined select (`secretaryPostgrest.ts:3-75`), so a statement timeout remains possible on the same family of secretary surfaces. Separately, replication download failures are surfaced through `notifications.error(formatDownloadFailureToast(downloadFailures))` (`ReplicationSyncProvider.tsx:345-350`), and the formatter includes the raw table name plus raw error string (`replicationSyncFormatters.ts:15-21`), while replicated table adapters still produce strings like `Supabase query failed: ${error.message}` (`ReplicatedEntriesTable.ts:146-150`, `:203-205`). |

### Follow-up Scope for S2

Create a small follow-up plan/PR for the entries read path:

- Add a focused unit test for `formatDownloadFailureToast` proving database/vendor
  details such as `Supabase query failed` and `statement timeout` are not shown
  to users; expected copy should be calm, actionable, and table-agnostic.
- Add a focused test around `getEntriesForShow` showing a cold replicated store
  fallback failure returns a page error without overwriting existing entries with
  a confident zero.
- Investigate the direct fallback query with `EXPLAIN`/database evidence before
  changing schema or indexes. The likely code target is the wide
  `SECRETARY_ENTRIES_SELECT` in `secretaryPostgrest.ts`, but this spike did not
  run live DB diagnostics.
- Keep the already-fixed stale OCC-token root cause closed; S2 is now a
  read-performance and user-facing error-message follow-up, not a new OCC storm.

## Resolution (2026-07-03)

All five leads are resolved. Leads **A, D, E** (the three CONFIRMED bugs) were
fixed in [PR #1098](https://github.com/rbeezley/myk9-platform/pull/1098)
(`be2103626`, "fix(replication): harden OCC conflict resolution") exactly as the
fix-scope sections below prescribe: `rebuildUpdatePayload` added to every
non-entry adapter (A); `clearConflict` now merges server-changed untouched fields
and refreshes the queued payload (D); the empty-UPDATE OCC re-check now threads
its error into `classifyEmptyUpdateResult` and classifies re-check failures as
RLS/auth rather than row-deletion (E). Lead **B** was NOT A BUG. Lead **C**'s
NEEDS-TEST question was answered by pinning the current behavior as the intended
invariant — the test `preserves a locally-created dirty row without promoting the
matching remote row to a base` in `packages/replication/src/syncReplicatedTable.test.ts`
(added in the same PR) documents that a locally-created dirty row is deliberately
preserved without base/serverVersion promotion. No further replication follow-up
plan is required.

## Scope

This is the findings document for
[`improve-audit-2026-07/005-replication-occ-watermark-spike.md`](improve-audit-2026-07/005-replication-occ-watermark-spike.md).
It is read-only investigation output; no replication source was changed.

Original drift check (2026-07-03):
`git diff --stat 929240192..HEAD -- packages/replication` returned no package
diff when the first findings document was authored. The 2026-07-04 re-check
above supersedes that baseline note.

Settled leads recorded from the plan:

- Quota eviction deleting dirty rows remains false: `evictToTarget` rejects dirty
  rows before eviction (`packages/replication/src/core/ReplicatedTableCache.ts:240`).
- INSERT `23505` left in the failed queue remains fixed:
  `MutationManager.executeMutation` treats duplicate client-generated INSERTs as
  success (`packages/replication/src/MutationManager.ts:700`).

## Original Verdict Table (Pre-PR #1098)

| Lead | Verdict | Summary |
|------|---------|---------|
| A | CONFIRMED bug | Non-entry replicated tables use OCC tokens but do not provide `rebuildUpdatePayload`, so full-row queued UPDATE payloads stay stale after dirty-row reconciliation. |
| B | NOT A BUG | No table was found mixing table-global metadata reads/writes with scoped metadata slots in a way that can poison scoped watermarks. |
| C | NEEDS-TEST | Locally-created dirty INSERT rows have no base snapshot; if they appear from the server before queue cleanup, the dirty sync path cannot establish a 3-way base. |
| D | CONFIRMED bug | `keep-local` conflict resolution advances the token but does not merge server-changed non-conflicting fields or refresh queued full-row payloads. |
| E | CONFIRMED bug | The direct UPDATE OCC re-check ignores SELECT errors and classifies failed/invisible reads as missing rows; passcode-specific reachability is reduced by the ringside RPC path but the direct path is wrong. |

## Lead A - OCC Token Not Advanced For Non-Entries Full-Row Updates

Verdict: CONFIRMED bug.

Evidence:

- OCC is intentionally global to replicated tables: migration
  `20260608200000_replication_version_column.sql` adds a `version` column to
  clubs, shows, trials, classes, entries, dogs, judge_assignments, armbands, and
  waitlist_entries (`supabase/migrations/20260608200000_replication_version_column.sql:12`).
- The generic sync engine extracts remote `version` and stores it as
  `serverVersion` for future OCC preconditions
  (`packages/replication/src/syncReplicatedTable.ts:211` and
  `packages/replication/src/syncReplicatedTable.ts:309`).
- The generic queue path stamps `serverVersion` on every UPDATE when conflict
  surfacing is enabled (`packages/replication/src/core/ReplicatedTable.ts:157`).
- Conflict surfacing is on by default and documented as covering all replicated
  tables (`apps/myk9show/src/config/features.ts:58`,
  `apps/myk9show/src/features/show-presence/conflictSurfacingFlag.ts:7`).
- Upload applies the OCC precondition whenever `mutation.serverVersion` is set
  (`packages/replication/src/MutationManager.ts:763`).
- Dirty-row reconciliation calls `reconcilePendingMutationsForRow` with
  `adapter.rebuildUpdatePayload` (`packages/replication/src/syncReplicatedTable.ts:268`),
  but full-row queued UPDATEs are skipped if no rebuilt payload exists
  (`packages/replication/src/MutationManager.ts:331`).
- Only entries define `rebuildUpdatePayload`
  (`apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts:155`).
- Non-entry tables have full-row direct UPDATE paths without rebuild hooks, for
  example classes (`apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:435`),
  dogs (`apps/myk9show/src/services/replication/ReplicatedDogsTable.ts:323`),
  trials (`apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts:280`),
  shows (`apps/myk9show/src/services/replication/ReplicatedShowsTable.ts:322`),
  and judge assignments
  (`apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts:265`).

Impact:

A non-entry dirty row can reconcile its IDB `serverVersion` forward while leaving
the queued full-row UPDATE carrying the old token and old payload. That can
re-trigger stale OCC retries or preserve a stale payload until the queue changes
for another reason.

Fix scope:

Add `rebuildUpdatePayload: row => this.toSupabaseRow(row)` to every adapter that
queues direct full-row UPDATEs and uses server `version`, or teach the generic
sync layer to require/provide a rebuild function for full-row OCC tables. Keep
RPC delta writes exempt.

Proof test:

In `packages/replication/src/syncReplicatedTable.test.ts`, create a dirty
non-entry-style full-row UPDATE with `serverVersion`, sync a remote row with an
advanced `version` and a non-conflicting server field, then assert the queued
mutation's `serverVersion` and `data` are rebuilt. Run the test red before
adding the hook/default.

## Lead B - Scoped Vs Unscoped Watermark Mixing

Verdict: NOT A BUG.

Evidence:

- Scoped metadata reads project `scopes[scopeValue]`; only
  `scopeValue === undefined` returns the table-global row
  (`packages/replication/src/core/ReplicatedTableCache.ts:390`).
- Scoped metadata writes route `lastIncrementalSyncAt` and `totalRows` into
  `scopes[scopeValue]`; the table-global watermark is only an informational
  mirror and scoped reads do not consult it
  (`packages/replication/src/core/ReplicatedTableCache.ts:459`,
  `packages/replication/src/core/ReplicatedTableCache.ts:474`).
- Table-global adapters pass `{}`: clubs
  (`apps/myk9show/src/services/replication/ReplicatedClubsTable.ts:167`),
  waitlist entries
  (`apps/myk9show/src/services/replication/ReplicatedWaitlistEntriesTable.ts:120`),
  armbands (`apps/myk9show/src/services/replication/ReplicatedArmbandsTable.ts:147`),
  and judge assignments
  (`apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts:191`).
- Scoped adapters always pass an object with `value`: dogs
  (`apps/myk9show/src/services/replication/ReplicatedDogsTable.ts:155`),
  entries (`apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts:190`),
  classes (`apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:374`),
  trials (`apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts:190`),
  and shows (`apps/myk9show/src/services/replication/ReplicatedShowsTable.ts:223`).
- Some callers pass `''`, for example class refreshes
  (`apps/myk9show/src/components/trials/TrialDetail/TrialManagementDialogs.tsx:207`,
  `apps/myk9show/src/pages/ClassDetailsPage/index.tsx:141`), but `''` is still
  a scoped slot key, not table-global metadata.

Reasoning:

No table was found that sometimes calls `syncReplicatedTable` with `{}` and
sometimes with `{ value: ... }`. Empty-string calls may fetch all rows, but they
remain in scoped metadata mode and cannot read the table-global watermark.

## Lead C - Missing BaseData For Locally-Created Rows

Verdict: NEEDS-TEST.

Evidence:

- A new dirty row with no existing clean row does not capture `baseData` or
  `baseVersion`; `buildReplicatedRowForSet` only captures a base when an existing
  non-dirty row is present
  (`packages/replication/src/core/ReplicatedTableRowState.ts:23`).
- The normal local create path calls `set(..., true)` before queueing an INSERT,
  for example classes
  (`apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:464`) and
  dogs (`apps/myk9show/src/services/replication/ReplicatedDogsTable.ts:346`).
- During sync, dirty rows only enter conflict detection/reconciliation when
  `existing.baseData !== undefined`
  (`packages/replication/src/syncReplicatedTable.ts:222`).
- The no-base branch preserves the dirty row unless an adapter has
  `mergeDirtyRow`; it explicitly says no OCC token exists in that path
  (`packages/replication/src/syncReplicatedTable.ts:284`).

Risk:

If a locally-created row is visible from the server before its INSERT mutation is
cleared, the client has a current remote snapshot but does not promote it into a
merge base. Later same-field detection can be skipped or delayed until a future
clean state is established.

Fix scope:

Do not fix without a red test. If confirmed, the dirty/no-base sync branch should
decide whether a matching remote row for a local INSERT can safely become the
row's base snapshot and advance `serverVersion` without clearing the pending
INSERT prematurely.

Proof test:

In `packages/replication/src/syncReplicatedTable.test.ts`, seed a dirty local
row created with `set(id, row, true)` and no base, then sync a remote row with the
same id and a server `version`. Assert whether the row should gain `baseData` /
`serverVersion` and whether a subsequent local edit can surface a conflict. Run
that assertion red first; if current behavior is intentional, document the
invariant in the test instead.

## Lead D - Keep-Local Drops Server-Changed Non-Conflicting Fields

Verdict: CONFIRMED bug.

Evidence:

- Dirty-row conflict detection considers the union of base/local/remote keys
  (`packages/replication/src/conflict/detectDirtyRowConflict.ts:31`).
- On the no-conflict path, `mergeNonConflictingServerFields` adopts remote fields
  that changed while local stayed at base
  (`packages/replication/src/conflict/detectDirtyRowConflict.ts:97`).
- But when any same-field conflict exists, sync marks a conflict and skips the
  non-conflicting merge path (`packages/replication/src/syncReplicatedTable.ts:229`,
  `packages/replication/src/syncReplicatedTable.ts:260`).
- Manual `keep-local` only calls `clearConflict`
  (`packages/replication/src/core/ReplicatedTable.ts:742`), and
  `clearConflictSnapshot` only sets `syncStatus: 'pending'`, clears the conflict,
  and advances `serverVersion`
  (`packages/replication/src/core/ReplicatedTableConflict.ts:27`).
- Full-row queued mutations then upload their existing `data`; direct UPDATEs
  send `mutation.data` via PostgREST
  (`packages/replication/src/MutationManager.ts:766`).

Impact:

Choosing "keep local" for the conflicting fields can also keep stale values for
server-changed non-conflicting fields. For full-row direct UPDATE payloads, that
can overwrite server-authoritative fields that the user did not intend to reject.

Fix scope:

On `keep-local`, merge server-changed/client-untouched fields from the conflict
snapshot into the local row before clearing the conflict, and refresh any queued
full-row direct UPDATE payloads just like the non-conflicting dirty reconciliation
path does. Preserve the user's local values only for the actual conflict fields.

Proof test:

Add a conflict-resolution test where `status` conflicts but `finalPlacement` (or
a generic server-only field in package tests) changed only on remote. After
`keep-local`, assert the local row keeps local `status`, adopts remote
`finalPlacement`, advances `serverVersion`, and the queued UPDATE payload is
rebuilt before upload.

## Lead E - Failed OCC Re-Check Misclassified As Row Deleted

Verdict: CONFIRMED bug.

Evidence:

- On a direct UPDATE that returns zero rows, `MutationManager` performs an OCC
  re-check with `.select('version').maybeSingle()`
  (`packages/replication/src/MutationManager.ts:776`).
- That re-check destructures only `data`; any Supabase `error` is ignored
  (`packages/replication/src/MutationManager.ts:781`).
- `classifyEmptyUpdateResult` receives only `serverCheck`; when
  `serverVersion !== undefined` and `serverCheck` is falsy, it returns
  "row no longer exists" (`packages/replication/src/mutation-occ.ts:76`).
- Existing tests cover null-as-row-missing and unchanged-version-as-RLS, but
  there is no failed-recheck input because the classifier has no error parameter
  (`packages/replication/src/mutation-occ.test.ts:67`,
  `packages/replication/src/mutation-occ.test.ts:91`).
- Passcode ringside entry writes that use `ringside_update_entry` avoid this
  direct re-check: the RPC returns the authoritative conflict version through
  `DETAIL` specifically because passcode/assigned ringside identities can be
  denied direct entry reads
  (`supabase/migrations/20260625190000_ringside_update_entry_surface_conflict_version.sql:5`,
  `supabase/migrations/20260625190000_ringside_update_entry_surface_conflict_version.sql:189`).
- Anonymous passcode sessions are real Supabase sessions with a stamped
  `app_metadata` claim
  (`apps/myk9show/src/pages/ringsideAnonSession.ts:1`,
  `supabase/functions/validate-passcode/index.ts:243`), and stale anonymous users
  can be deleted by cleanup after show end or max age
  (`supabase/migrations/20260625000100_cleanup_stale_ringside_anon_users.sql:19`).

Impact:

For direct UPDATE OCC paths, a failed/invisible re-check is permanently shaped as
"row deleted" instead of "auth/RLS/session problem". The passcode entry-scoring
path is mostly protected by the RPC, but the generic direct path is wrong and can
dead-letter or misreport recoverable auth failures.

Fix scope:

Capture `{ data, error }` from the re-check and pass an explicit error/status to
`classifyEmptyUpdateResult`. Treat re-check errors as auth/RLS/transient failures,
not row deletion. Keep the RPC detail path unchanged.

Proof test:

Add a `mutation-occ` unit test for a failed re-check classification and a
`MutationManager` test whose mocked `.maybeSingle()` returns `{ data: null,
error: { code: '42501' } }`; assert the mutation failure is classified as RLS/auth
and not "row no longer exists server-side."

## Follow-Up Plan Split

Recommended follow-up order:

1. Fix Lead A first; it is the smallest broad reliability hardening and directly
   affects all non-entry replicated tables under the currently enabled conflict
   surfacing flag.
2. Fix Lead D second; it protects user conflict resolution from unintended
   clobber after "keep local."
3. Fix Lead E with classifier tests; this is mostly diagnostic/retry correctness
   for direct UPDATE paths.
4. Run Lead C as a test-first mini-spike; only implement if the red test proves
   the local-INSERT/base promotion invariant should change.
