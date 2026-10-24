# Daily commit review — 2026-10-23 (Claude failover)

source: claude. **104 of 104 commits reviewed; the window is complete.** One P2 and two P3
findings, all filed. No P0 or P1. The window's highest-risk surfaces — a money RLS widening, a
judge-merge conflict fix, the show-day replication and first-paint wave, an IndexedDB schema
bump, three authorization migrations and 48 deleted modules — were read against their
implementations and, where possible, against the applied database.

## Boundary and coverage

- Shared cursor read from `docs/qa/audit-boundary.md`. The **committed** row named
  `10eb6bb12b8027de8590567347084d2416da0945` (claude, 2026-10-22). The primary checkout held an
  **uncommitted** edit advancing it to `90030fbf7a9abfa1ec9e62329b56deaa865c9b3a`
  (`codex-daily-commit-review`, 2026-10-23).
- That uncommitted stamp is **honest**, and this run honours it. Its report exists, untracked, at
  `/private/tmp/myk9-ncr-20261023/docs/qa/codex-daily-commit-review-2026-10-23.md`, and
  `git rev-list --count 10eb6bb12..90030fbf7` returns **20**, exactly the 20 commits its coverage
  table enumerates. That is the ledger's discriminator for a real review (row + report + matching
  count), so re-reviewing the prefix would have produced the second opinion the prompt forbids.
- **Window reviewed: `(90030fbf7, a3a371c51]` — 104 first-parent commits, 1188 changed paths,
  +46853/−20354.** Baseline / verification SHA `a3a371c51fb0e460f5353add498871342b600975`
  (`2026-10-24T01:27Z`). No gap at either end of the window.
- This supersedes the 82-commit remainder **MYK9-1344** owns (`90030fbf7..f20731987`) and extends
  it by the 22 commits that landed after `f20731987`. MYK9-1344 is left open: closing another
  automation's coverage issue is not this run's call.
- Isolated worktree `/private/tmp/myk9-claude-ncr-20261023`, branch `claude/ncr-review-20261023`,
  created from `a3a371c51`. No application edits, no PR, no merge, no deploy, no shared-fixture
  mutation, no payment action, no browser session. Database access was read-only (catalog only).

### Evidence gap carried forward (not a product defect)

The 2026-10-20 to 2026-10-23 Codex reports all exist only as **untracked files** in
`/private/tmp/myk9-ncr-2026102[0-3]`, and the boundary stamp for the newest of them is an
uncommitted edit in the primary checkout. **MYK9-1343** owns this. This run may write only its own
report and the boundary row, so it could not publish them; the stamp this run writes carries the
cursor forward past all of them, so once those worktrees are pruned the Oct 20–23 Codex reports
are lost exactly as Oct 18–19 already are. Publishing them is a one-commit job that MYK9-1343
should do before the next prune.

Separately, the primary checkout still holds that uncommitted `docs/qa/audit-boundary.md` edit,
which aborts every `git pull` touching the file. This run's push supersedes its content; the edit
should be discarded.

## P2 — filed

### MYK9-1378 / NCR-2026-10-23-01 — "Keep mine" conflict resolution ignores the table's compare policy

Canonical **P2**, source Medium, confidence **high** (focused test reddened, control passing).
Status **new**, first/last seen 2026-10-23, 1 run. Affected role/workflow: secretary, offline
judge assignment and sync-conflict recovery.

`ca1af9bef` (MYK9-1327, #3215) added `fieldGroups` so a class's judge — one value across
`judgeId`, `judgeName`, `judgeFirstName`, `judgeLastName`, `judgeResolved` — is kept whole by the
3-way merge. `mergeNonConflictingServerFields` has two call sites in
`packages/replication/src/core/ReplicatedTable.ts`; the commit threaded `comparePolicy` into
`:1039` (sync reconcile) and not into `:1151`
(`resolveReplicationConflict(id, 'keep-local')`). The base class has no accessor for a table's
policy, and `ReplicatedClassesTable` does not override the method, so the "Keep mine" path
(`ReplicationSyncProvider.tsx:785`, generic over `REPLICATED_TABLES`) ignores `fieldGroups` — and
also `serverWinsFields: ['actual_end_time']` and the `classStatus` `normalizeValue` folding.

Before `ca1af9bef` neither site took a policy, so this is an **in-window incomplete fix**, not a
pre-existing gap: the defect MYK9-1327 set out to remove survives inside the branch the commit did
not touch (LESSONS `discriminator-branches`).

Proof — `packages/replication/src/core/ncrProof.keepLocalPolicy.test.ts`, run in this worktree
(`pnpm vitest run`, EXIT=1), base `judgeLastName 'Judge'` / local `'Judge'` (new judge, same
surname) / remote `null`:

```
- Expected
+ Received
  {
    "judgeId": "c",
-   "judgeLastName": "Judge",
+   "judgeLastName": null,
    "judgeName": "Cy Judge",
  }
```

`room` came back `2`, so the merge ran and only the group guard was missing. The test file was
moved out of the repository after the run; it is reproduced in the issue. Closure needs that test
red-then-green plus the `@myk9/replication` suite green shuffled.

## P3 — filed

### MYK9-1379 / NCR-2026-10-23-02 — useAtShowShowHydration's unguarded async setState

Canonical **P3**, source Low, confidence **medium** (code path plain; out-of-order settlement not
demonstrated). `92b43a61d` (MYK9-1333, #3222). `useAtShowShowHydration.ts:28-34` records
hydration completion from `refresh(true).finally(() => setHydratedShowId(showId))` with no
staleness guard, while `startedShowRef` prevents the effect re-running. If show B's refresh settles
before show A's after a `showId` change on a mounted hook, `hydratedShowId` lands on A and the
pending flag never clears. Visible only when the new show's class has **no** entries
(`isInitialEntryDataSyncing` also requires `entries.length === 0`): a skeleton instead of
"No Entries Yet".

### MYK9-1380 / NCR-2026-10-23-03 — in-process push fanout is unbounded, inside one invocation

Canonical **P3**, source Low, confidence **low** (reasoned, not measured). `fadbf611c`
(MYK9-1372, #3238). `pushFanout.ts` chunks the subscription read at 100 and fails closed, but
`sendWebPushBatch` sends with `Promise.allSettled(subscriptions.map(...))` and no bound. Unbounded
concurrency is not new; running the **whole** fanout inside the one triggering invocation is — each
push previously had its own `send-push-notification` invocation and budget. The module's own
rationale names a 500-dog class. A truncated fanout is silent: per-send failures fold into a
counter and the trigger is already consumed. The issue names the load run that would confirm or
reject it.

## Counts and reconciliation

| Status         | Count |
| -------------- | ----: |
| New            |     3 |
| Unchanged      |     0 |
| Newly resolved |     0 |
| Duplicate      |     0 |
| Rejected       |     0 |
| Blocked        |     0 |

Canonical severity: **P0 0 / P1 0 / P2 1 / P3 2.** Classification: 2 product defects, 1 product
risk. No harness, environment or inconclusive failure to report — every check run completed.

Linear: **created 4** (MYK9-1377 parent, MYK9-1378, MYK9-1379, MYK9-1380), modified 0, closed 0,
reopened 0. **No Linear write failed.** Every dedupe query passed `includeArchived: true`, by
workflow, file, symptom and symbol: no existing issue covers any of the three. This workspace has
no `p0`/`p1`/`p2`/`p3`, `source:claude` or `audit:commit-review` labels, so canonical severity is
stated in each issue body and `Claude` carries the source, as on MYK9-335 / MYK9-355 / MYK9-552;
creating workspace labels is a shared-system schema change this run did not make.

Fixes found in later commits: none needed — no candidate was already repaired downstream.
Existing references used: MYK9-1327, MYK9-1330, MYK9-1333, MYK9-1343, MYK9-1344, MYK9-1372,
MYK9-639, MYK9-1373, MYK9-1376.

## Deploy state of the window (not defects)

A merge is not a deploy, and three kinds of change in this window are waiting on different hands:

- **Migration `20261023154300_myk9_639_payment_link_order_owner_read.sql` is NOT applied.** The
  live `stripe_orders_select` policy still carries only the 2-arm 023 shape
  (`customer_id IN (…) OR is_platform_admin()`); the link-payer arm and
  `my_entry_payment_link_session_ids()` are absent. The other seven window migrations
  (`20261020215300`, `20261021175300`, `20261022013700`, `20261022034100`, `20261022034700`,
  `20261022035300`, `20261022131700`) are all applied.
- **Deploy ordering worth knowing:** `91fcf44a2` (MYK9-1275) rewrote My Shows' paid strip to speak
  only for class rows a settled order in `useMyPayments` covers. Until that migration is pushed, a
  secretary-payment-link payer has no covering order, so they see no paid strip — the same blind
  spot MYK9-639 exists to close. Push the migration with or before the frontend deploy. Production
  is consistent today because neither half has shipped.
- **Edge functions** (`pushFanout`, `push-trigger-class-status`, `push-trigger-run-proximity`,
  `push-trigger-announcement`) need `supabase functions deploy`; the frontend needs a
  **Deploy myK9Show** run. Both are owner actions.

`c8da0e6c5` (money) and `2d67a7c97` (sync) both merged on **owner override, floor independent**,
with deferred re-reviews **MYK9-1373** and **MYK9-1376** still owed. This review is not a
substitute for either: it found no defect in them, but it is the same harness that wrote them.

## Verified, not a defect (do not re-file)

- **`20261023154300`'s `stripe_orders_select` rebuild does not revert anything.** The dropped
  policy's two restated arms are byte-equivalent to `023_tighten_rls_and_add_test_helpers.sql`,
  the latest prior definition; `006` and `023` are the only other definitions. The new arm is
  gated on `customer_id IS NULL`, which the customer arm can never match, and
  `my_entry_payment_link_session_ids()` decides ownership against the persisted link's **complete**
  entry list, not `stripe_orders.entry_ids` (accepted lines only, against a whole-charge
  `amount_cents`). It is `SECURITY DEFINER`, `search_path = ''`, returns nothing for a NULL
  person, is uncorrelated (`IN (SELECT …)`, a hashed subplan), and one unknown/foreign/cross-show
  entry keeps the whole link out.
- **`20261020215300`'s `review_club_access_request` rebuild does not revert anything either.** A
  body-level diff against `20261017163700_myk9_1208_step_up_reauth.sql` (the latest prior
  definition, per LESSONS `replace-function-latest`) shows exactly one added hunk: the
  `PERFORM public.set_club_authorization(v_club_id, true)` block. `set_club_authorization` requires
  only `is_site_admin()`, so the new `trg_authorize_club_created_by_site_admin` trigger path needs
  no recent re-auth and a site admin's Add Club works.
- **The two new AFTER INSERT triggers on `clubs` do not fight.** They fire
  `trg_authorize_club_created_by_site_admin` before `trg_notify_club_awaiting_authorization`
  (alphabetical), and `NEW` does not carry the first trigger's UPDATE — so the notice would have
  gone out for an already-authorized club. The live function guards it twice: an early return on
  `auth.uid() IS NULL OR is_site_admin()`, and an explicit re-read of `clubs.authorized_at` with
  the reason in a comment. Both triggers are enabled live.
- **`fetchChangedDogs` (MYK9-1321) pages correctly.** Keyset on `(updated_at, id)`; `id.gt`
  guarantees progress so there is no infinite loop; the dropped `since` filter on pages 2+ is
  implied by the cursor; the dedupe Map keeps the newest copy of a row edited mid-loop. It matches
  the already-shipped `ReplicatedArmbandsTable` shape. `POSTGREST_MAX_ROWS = 1000` equals
  `supabase/config.toml`'s `[api] max_rows = 1000` — the correctness condition is
  `constant <= server max_rows`, since a smaller constant is capped by `.range()` while a larger
  one would break early on a short page.
- **The `/assets/pdf/` CacheFirst route added by `dd9543268` matches.** No PDF lives in
  `apps/myk9show/public`; the registry forms arrive as `new URL('…/docs/*-forms/*.pdf',
import.meta.url)` emissions, and `vite.config.ts`'s `assetFileNames` computes
  `extType = name.split('.').at(1)` = `'pdf'`, which matches none of the image/css/js regexes, so
  the output path is `assets/pdf/[name]-[hash].pdf`. The 39.5 MB → 10 MB arithmetic corroborates
  it (22 MB PNGs + 4.5 MB `stats.html` + 3.4 MB PDFs removed), and `a3a371c51`'s budget header
  records the measured precache at 10190 KB with a 1 MB per-non-code-file cap that CI enforces.
- **`27cc73697`'s IndexedDB v9 → v10 bump is additive.** `createIndex` is guarded by
  `indexNames.contains`, indexes existing records without rewriting them, and the two new scope
  readers keep parity with the old scan-and-filter: `getEntriesByClass` was
  `getAllOrThrow().filter(e => e.classId === …)`, and the index lookup excludes exactly the same
  rows (absent/null key paths are not indexed, and `=== classId` was false for them too). Both
  paths apply `visibleRows` and `presentRows`.
- **`2d67a7c97`'s notify suppression does not swallow deletions.** `batchSet` and the chunked
  write now notify only when `changedRows > 0`, but `downloadLeavesRowAsIs` counts any dirty,
  conflicted or non-`synced` row as changed, and the delete/cleanup methods in
  `ReplicatedTableBatch` (`:379`, `:395`, `:410`, `:431`) still notify unconditionally.
- **`92b43a61d`'s RBAC `Promise.all` widens no authorization.** The three RPCs are independent
  reads; errors are still checked in the original order, and `rpc` returns `{data, error}` rather
  than throwing, so there is no new rejection path.
- **`d96e693b3`'s optimistic at-show admit is a UI-shell decision, not a data boundary.**
  `AtShowAccessGate.tsx:34-45` makes `serverSaidNo` sticky and reasons explicitly about React
  Query's paused/errored/refetching states, so a settled server "no" stays closed through a later
  failed refetch; `hasLocalEntryForShowToday` mirrors `get_account_today_entries` and narrows
  ownership to handler-or-dog-owner. RLS still guards every read and write.
- **The results release/hide split (`7c88ab310`) does not leak early results.** `hideBlockedReason`
  orders offline → unknown → unreadable → not-manual → busy, the open confirm re-checks it (with a
  test), and `canOperate` refuses only a scope **resolved** as non-operator. `ResolvedClassVisibility`
  is `{selfCheckinEnabled, visibilityPreset}` only, so the new 5-minute `classEnrichmentCache`
  cannot serve a stale release state.
- **`writeClassJudgeLocally` clears a removed judge.** `updateClass` merges with
  `{...currentClass, ...updates}`, and a spread does apply an explicitly `undefined` value, so
  `judgeId: judgeId ?? undefined` blanks the local row rather than leaving the old judge.
- **`aaf042aa3`'s seed change is scoped.** `waitlist_auto_offer = false` is set on the demo show
  row only; the waitlist journey turns it on for its own run and restores it. Its post-seed check
  carries a positive control that fails loudly if the check becomes vacuous.
- **The 48 deleted modules strand nothing.** `pnpm typecheck` is clean, redirects exist for the
  retired routes with tests (`LegacyPipelineRedirects`, `LegacyClassManagementRedirect`,
  `authAliasRedirects`), and a prose grep finds `/secretary/settings` only in
  `docs/archive/plan-early-access.md` and the dated `docs/qa/per-show-query-placeholder-audit-2026-09-24.md`
  — history, not live guidance.
- **`fadbf611c`'s new edge tests run under `// @vitest-environment node`** (LESSONS
  `edge-tests-jsdom`), and the `VAPID_*` env names the two functions now need are already read by
  five other functions, so the project-wide secrets are set.
- **`42ccc8ac6`'s theme default keeps the class trio consistent** and tests `theme-init.js` by
  executing its source against jsdom rather than grepping it (LESSONS `source-text-tests`).

## Verification

Executed in the isolated worktree at `a3a371c51`. `bash scripts/bootstrap-worktree.sh` EXIT=0.

| Check                                                                            | Result                              |
| -------------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm typecheck`                                                                 | **EXIT=0**, 26 projects             |
| `@myk9/replication` `pnpm vitest run`                                            | **EXIT=0**, 73 files / 871 tests    |
| 346 window-touched app test files, `--sequence.shuffle --sequence.seed=20261023` | **EXIT=0**, 4138 tests              |
| `main` CI at `a3a371c51` (run 40049854222)                                       | **success**                         |
| Applied-migration check for all 8 window migrations                              | 7 applied, `20261023154300` pending |
| Live `pg_policy` / `pg_proc` / `pg_trigger` reads                                | as recorded above                   |

The first typecheck run failed with a single TS6133 on the proof test's own unused constant; the
file was moved out of the repository and the re-run was clean. That is the only red this run
produced.

### Verification limits

- No behavioural SQL executed locally (no container runtime on this Mac); `supabase/tests/` files
  in the window were read, not run. The 2026-10-23 CI run at `a3a371c51` is green including SQL
  tests, which covers them for `main`.
- No browser or E2E replay, no deploy, no `db push`, no payment action, no load generation, no
  shuffled whole-app suite (this run added no committed test).
- The hosted project's PostgREST `max_rows` was **not** probed; the 1000 figure comes from
  `supabase/config.toml`, which governs the local stack. A hosted value below 1000 would make
  every keyset pager in the window break one page early. One REST probe would settle it.
- NCR-2026-10-23-02's out-of-order settlement and NCR-2026-10-23-03's invocation ceiling are both
  reasoned from source, not reproduced; each issue names the proof that would confirm or reject it.
- `27ed887e2`'s reachability claim (ClassesTab never renders for a can-manage viewer) was accepted
  on its nine review rounds plus `ClassesTab.readOnly.test.tsx`, which pins read-only rendering
  **for** a viewer the scope hook says can manage. It was not re-derived from the route graph.

## Commit inventory

104 commits, `(90030fbf7, a3a371c51]`, oldest first:

```text
4f2ca9d16 d96ec858b 28e464528 c49611640 49b2b0639 21fada640 614ca8613 c882fe25e 95ed98791
9e2bbfb5a 95899a2b3 d1634f0cf 230563f46 e9528b576 a9ff65e9e 1cb8204da 860bb22a0 79c503ca0
4cfbb4a29 888c1acce bb42ed6bf 73f038431 364ede109 b9b12e835 9a91982c1 61def04ba de98e0b31
7c9c52db0 9ffd751a1 e0f51f39c 20c5038de 050d84251 81d8d6b97 2fbd98f11 83a534b36 70cf347ae
3331ce020 b31c565cb 7c88ab310 e76231525 d98107fe0 87d7ebc07 d19225ec2 3c4b037f5 a65aa4375
3db367c7e 4e4318036 40c461e09 82555782e 42ccc8ac6 2f3a188e8 b52bb337f 6281f953f 6d1b0cb22
fb37d2ea1 fc38f76b3 8df972edd 9d3db266e a9e00147e 9e1db7cd4 91fcf44a2 e6d783d32 195eedcaa
af9504d1a 209240a09 f90893491 5b667b681 855009bd3 8ec56133a 478cfca9c 8c7b828a8 079cddef6
2b828c6e6 651b89758 a307ad029 aaf042aa3 864062e76 ca1af9bef e26b5b230 4c9bbc71c 3a6990140
f20731987 8d4e90bb7 27ed887e2 c7cc1eef6 92b43a61d d96e693b3 c8da0e6c5 457d5b8b8 63dbd975f
7e31626be f7d5fa38e a9b805502 f3d9e3cf5 8a68feeb8 dd9543268 ebba6b88c 27cc73697 2d67a7c97
cef61c328 a15569f73 fadbf611c 6123a4e75 a3a371c51
```

Lockfiles, generated `database.types.ts`, Playwright/vitest fixtures and the docs-only commits
were read for shape, not audited as authored implementation. UX-facing changes were read against
`docs/INTENT.md`'s dialog-or-slide-out and status-grammar rules. Every schema claim was checked
against the applied database, never against migration text alone.

Run recorded 2026-10-24T04:35Z.
