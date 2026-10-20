# Daily commit review — 2026-10-17

source: codex. **Partial review; two confirmed P2 residual defects.** No application code changed.

## Boundary and coverage

- Shared cursor read from the primary checkout: `edc7a69168a7a8358375814d07c683af7c5e6416`, exclusive; previous window end `2026-10-13T22:39:55Z`. No fallback or initial temporal gap.
- Fetched main/test baseline: `43b3912ad15a178d449a62e3c1cd2407c0510b59`. The requested range contains **133 commits**.
- Completed contiguous source review: **17 commits / 237 changed paths**, through `0952bffb22678c4382587a6f8edeedcb80ca6346`, inclusive. Window end `2026-10-14T15:58:37Z`.
- **116 later commits remain outside completed contiguous coverage.** Additional inspection of later fixes and static migration review does not constitute full review of those commits. This run does not complete the requested main-wide review; there is no ongoing test/environment blocker.
- Stamp: `0952bffb22678c4382587a6f8edeedcb80ca6346` / `2026-10-14T15:58:37Z` / `codex-daily-commit-review` / `2026-10-17`. Next run starts there, never at the test baseline.
- Existing [MYK9-1196](https://linear.app/myk9-platform/issue/MYK9-1196) owns the remaining review prerequisite and was updated with this progress.

Reviewed prefix: #2967 rulebook refresh; #2963 account-owned replication; #2969 server-first dog roster; #2968 stamp/empty-scope races; #2970 landing lifecycle; #2971 cold paper scoring; #2972 readable sync failures; landing plan archive; #2973 account-switch ringside reads; #2975 unpublished entries; #2974 registration queue rollback/dependencies; #2977 deliberate toggle exception; #2978 registration attribute consolidation; #2979 registration fallback/coalescing; #2980 cold class arrival; #2981 landing hero/signup; #2982 public empty-list actions. Generated assets, lockfiles and fixtures were not independently audited as authored implementation. UX review used `docs/INTENT.md`; schemas and account ownership were traced in their actual implementations.

## Counts

Exclusive lifecycle counts: **new 2; unchanged 1; resolved 0; duplicate 0; rejected 0; blocked 4**. Six P2 items and one P3 item. New means new residual evidence this run, including reopening an existing canonical issue. No P0/P1 finding confirmed. Two product concurrency defects; five existing verification prerequisites. No newly confirmed test/harness defect.

Linear: **created 1** (MYK9-1250), **modified 2** (MYK9-1212 reopened; MYK9-1196 progress), **closed 0**. Completed historical scopes were preserved. All actionable confirmed work has a canonical Linear contract.

## P2 — confirmed product findings

### MYK9-1250 / NCR-2026-10-17-01 — stale account sync deletes the current account's clean cache

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1250). **New; source Medium; high confidence; owner unassigned.** First/last seen 2026-10-17; first nightly observation. Baseline `43b3912ad15a178d449a62e3c1cd2407c0510b59`. Affects shared-device secretary/ringside account switching and offline entry availability.

Proof uses the actual `ReplicatedTable` and `syncReplicatedTable`, fake IndexedDB and a synthetic remote adapter. B has a clean, previously synced `b-only` row. A downloads `a-only` and passes the identity guard. The diagnostic switches identity back to B immediately after the real `batchSet` settles. Stale cleanup then resolves B's visible rows against A's server IDs and deletes `b-only`. The final account guard returns failure, but B's row is already absent. Observed result: `success:false`, `rowsAffected:2`, `remaining:[]`, error `The signed-in account changed during the sync; nothing was completed.`

Expected: A's stale sync must never remove B's cached rows. Impact is recoverable clean-cache loss and unavailable offline reads, not server deletion or demonstrated loss of queued scores. This is a residual in the new account-isolation contract (#2963), not a claim that all older cleanup was safe.

Exact baseline references:

- [syncReplicatedTable.ts:352](https://github.com/rbeezley/myk9-platform/blob/43b3912ad15a178d449a62e3c1cd2407c0510b59/packages/replication/src/syncReplicatedTable.ts#L352): cleanup executes before the late guard at line 407; scoped cleanup at lines 367–369 obtains current-account local rows.
- [ReplicatedTable.ts:1493](https://github.com/rbeezley/myk9-platform/blob/43b3912ad15a178d449a62e3c1cd2407c0510b59/packages/replication/src/core/ReplicatedTable.ts#L1493): stale-row cleanup resolves visible rows under current identity.
- `ReplicatedEntriesTable.ts:447` and `ReplicatedWaitlistEntriesTable.ts:166`: affected full-sync cleanup opt-ins.

Archived-inclusive deduplication searched cleanup method names, stale sync, account cleanup and scope ownership; exact MYK9-1133/1148/1149/880/775 contracts were read. Their completed exposure, stamping, empty-proof, RLS and missing-cleanup scopes do not own this deletion race.

Next action/closure: bind cleanup to captured ownership with an atomic guarantee; first reproduce red, then pass the controlled account-switch race, same-account deletion, dirty/local-only/unrelated-scope preservation and scoped/unscoped cases. Record disposable shared-device offline readback or an explicit owner-approved replacement gate. Full execution contract is in Linear.

### MYK9-1212 — failed concurrent replay clears another active sender's lease

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1212). **New residual; reopened to Todo; source Medium; high confidence; owner Richard.** Residual first/last seen 2026-10-17; first observation of this mechanism. Preserve the Oct16 original finding, #3068 fix and deployed v16 proof as completed historical scope. Baseline is the same captured main SHA.

Actual handler plus the repository's stateful SQL fake/provider reproduce: hold the first recovered send at its provider call; replay its same request/address; return synthetic HTTP 409 for the replay. `recordFailure` sets the shared job to failed and clears `claimed_until`, although the first call is still active. Correct the same owner's address and send a different request: it replaces the job and sends with a different idempotency key. Release the original call: it also succeeds. Three calls, two successful distinct-key deliveries, including the obsolete same-owner address. No real provider request or cross-owner disclosure was exercised.

- [20261016125300_myk9_1212_claim_lease.sql:155](https://github.com/rbeezley/myk9-platform/blob/43b3912ad15a178d449a62e3c1cd2407c0510b59/supabase/migrations/20261016125300_myk9_1212_claim_lease.sql#L155): tied same-request replay can proceed during an active lease.
- [lifecycle-email-handler.ts:637](https://github.com/rbeezley/myk9-platform/blob/43b3912ad15a178d449a62e3c1cd2407c0510b59/supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts#L637): non-OK replay calls failure handling.
- [lifecycle-email-handler.ts:687](https://github.com/rbeezley/myk9-platform/blob/43b3912ad15a178d449a62e3c1cd2407c0510b59/supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts#L687): unconditional job-ID failure update clears the active lease.

Expected: failure of one overlapping attempt cannot relinquish another live attempt's protection. Existing O1–O6 SQL proof exercises successful replay; it does not disprove this failed-replay sequence. Archived-inclusive claim/lease/replay searches and the complete canonical issue/comments support reuse, not a new issue.

Next action/closure: reassess attempt/lease ownership rather than add another superficial guard; red-first barrier test for failed concurrent replay, real SQL plus handler ownership proof, same-request replay/recovery/expiry controls, and separately authorized deployed proof. No migration execution or deployment was performed here.

## P2 — existing verification gates

All entries are source: codex, last reconciled 2026-10-17, baseline above; their full original acceptance and exact proof requirements remain in Linear. No code-only resolution is claimed.

| ID / status                                                                            | First seen / owner | Current evidence and next proof                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1196](https://linear.app/myk9-platform/issue/MYK9-1196), unchanged               | Oct15 / Richard    | Fresh 913 tests pass. Earlier RUN-only output is not a proven hang. Finish the remaining contiguous source review; diagnostic steps 1–3 remain supported, step 4 incomplete.                                                                                                                                                                                                                                                            |
| [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834), blocked audit proof       | Sep26 / Richard    | Owner's Oct13 Done decision preserved. No new defect alleged. Link deployed refocus → expired-token offline reload → local score → reconnect upload evidence with invalidation controls, or an explicit owned replacement gate.                                                                                                                                                                                                         |
| [MYK9-1011](https://linear.app/myk9-platform/issue/MYK9-1011), blocked residual proof  | Oct4 / Richard     | Owner's Oct16 live walk proves required DQ reason, database persistence, reload and undo. #3075 DISQ/DQ is an explicitly provisional owner decision; #3079 fixes Recent Results labels. Oct17 deployment evidence records both. Remaining: statistics-chart walk and live AskQ filter over a published, released DQ fixture. Do not repeat the completed persist/reload requirement or call the provisional mapping a confirmed defect. |
| [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), blocked operational proof | Sep17 / Richard    | Current scope P2/Medium verification; historical P1/High payment defect preserved separately. Owner's Oct14 comment still requires authorized Stripe TEST one/two-hop replays through both callers and matching financial/replica readback, with negative controls. No money operations performed.                                                                                                                                      |

## P3 — existing verification gate

[MYK9-1225 / QA-TIME-DISPLAY-001](https://linear.app/myk9-platform/issue/MYK9-1225): **blocked proof**, source Low, first seen Oct15, last Oct17, owner Richard, source: codex. #3091 (`84d537dfa`) replaces floating-point centisecond extraction with integer rounding, with recorded red-first formatter/real run-sheet consumer proof and shuffled tests. The Oct17 comment explicitly leaves the rendered secretary badge comparison against SQL/judge time owed. Preserve that gate; passing unit tests or a merge does not close it.

## Subsequent fixes and excluded signals

- #3028 atomically settles scope ownership stamps; it does not bind stale-row deletion to the captured account. It prevents reporting the earlier stamp race as a new defect.
- #3068 leases recovered email work; the new MYK9-1212 failed-concurrent-replay proof above survives it.
- #3091 fixes the reproduced formatter value; remaining visual proof stays under MYK9-1225.
- An older `docs/qa/landing-lifecycle-evidence.md` note reports dog-profile title/badge overlap at 390px. Current `ActivityTab.tsx:44–72` still uses a fixed date column and nonshrinking badge beside a narrow title, and later changes only touch recent results/time formatting. Archived-inclusive searches found no exact canonical issue. No fresh rendered geometry was obtained in this run, so this remains an **inconclusive historical signal**, not a newly confirmed defect or a claim of resolution. Reproduce the actual current phone surface before filing; do not fabricate a finding from CSS alone.

## Verification and limits

Isolated worktree `/private/tmp/myk9-ncr-20261017`, branch `codex/ncr-review-20261017`. Bootstrap succeeded with 12 cached package builds after the initial restricted-network attempt. Current primary checkout's unrelated changes were preserved.

- App: package-local `pnpm vitest run --sequence.shuffle --sequence.seed=20261017 --maxWorkers=4 <selected paths>` — **84 files / 840 tests passed**, 25.11s, exit 0.
- Replication: same flags in its package directory — **6 files / 73 tests passed**, 414ms, exit 0.
- Exact selections: `.logs/app-selection.txt`, `.logs/replication-selection.txt`; outputs `.logs/app-tests.log`, `.logs/replication-tests.log`. Buffered output is not a hang; both completed.
- `node --import tsx .logs/account-cleanup-race.ts` — exit 0, confirms cache-deletion diagnostic. Initial fake-indexeddb import-path error was corrected; not a product failure.
- `node --experimental-transform-types .logs/concurrent-replay-lease-race.ts` — exit 0, confirms lease diagnostic. Synthetic addresses only; no email sent.
- Static migration specialist reviewed all ten changed migrations and related SQL tests; found the lease residual above and no other confirmed migration defect. No real SQL test execution claimed.
- Raw prefix `git diff --check` exits 2 on imported rulebook text trailing whitespace; this is non-actionable source-formatting information, not a product finding. Excluding that imported text, the prefix check passes. No full suite, typecheck, lint, browser replay, live database test, deployment or payment operation was run.

The two diagnostics demonstrate failures, not fixes. Logs and scripts remain in the isolated worktree; Linear contains sanitized written reproduction and exact closure contracts so implementation does not depend on private logs. No GitHub writes, app changes, fixture writes or issue closures occurred.
