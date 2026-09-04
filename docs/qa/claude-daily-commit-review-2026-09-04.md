# Claude daily commit review — 2026-09-04

> **Status:** Reference — point-in-time review record.

Failover run for the paused `codex-daily-commit-review` stream. Ordinary regression review, not a
second opinion.

## Window

| Field                 | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Stream                | `daily-commit-review`                                                       |
| Committed cursor read | `d5a495862785711608e275d87da335633e4ed853` (2026-09-03T12:30:00Z, claude)    |
| Window reviewed       | `d5a495862`..`589b06fcaba3510e8a41316ac7c36e888fe4323e` (exclusive..inclusive) |
| Commits               | 34 (33 + this stream's own 2026-09-03 report commit `d17e5749c`)             |
| Files changed         | 333 (+5,240 / −27,215)                                                       |
| Baseline SHA          | `589b06fcaba3510e8a41316ac7c36e888fe4323e`                                  |
| Window end            | 2026-09-04T12:20:00Z                                                        |
| Coverage gap          | **None.** See "Boundary anomaly" below.                                      |

### Boundary anomaly — an uncommitted stamp claiming this window

The primary checkout held an **uncommitted** edit to `docs/qa/audit-boundary.md` stamping
`589b06fca` / 2026-09-04T10:13:07Z / `codex-daily-commit-review`. The *committed* row said
`d5a495862` / 2026-09-03 / `claude-daily-commit-review`.

Per traps 1 and 3 in the stream's automation memory, the committed row is authoritative and the
working-tree stamp was reconciled, not honoured. The stamp has the same shape flagged on 2026-09-03:
it touches `audit-boundary.md` and nothing else — no `findings.md` line, no report, no Linear
issue — and the task brief says that stream is paused for token budget. This run therefore reviewed
the whole range the uncommitted stamp claimed. That was the right call: the range contains two P1s.

**Recurrence note:** this is the third consecutive run on which a Codex-attributed boundary stamp has
appeared without an accompanying review artifact (2026-09-02 `42753661e`, 2026-09-03 `73569e478`,
2026-09-04 `589b06fca`). Three occurrences is a pattern, not an accident. Something is stamping the
shared cursor without reviewing. Recommend disabling that stamp until the Codex stream resumes, or
requiring the stamp commit to carry a report path.

## Counts

| Category                        | Count |
| ------------------------------- | ----- |
| New                             | 3     |
| Unchanged                       | 3     |
| Resolved                        | 1     |
| Duplicate                       | 1     |
| Rejected                        | 3     |
| Blocked                         | 0     |
| Fixes found in later commits    | 1     |
| Existing QA/Linear referenced   | 5     |
| Linear issues filed             | **0 — see "Linear write failure"** |
| Linear drafts prepared          | 3     |

## Linear write failure (reportable, not a silent skip)

**The brief requires every confirmed non-duplicate P0/P1 finding to be FILED directly as a Linear
issue. That could not be done: no Linear tooling is reachable in this session.**

- The only Linear surface configured is the OAuth MCP server `plugin:engineering:linear`, which the
  runtime reports as requiring authentication.
- This run is non-interactive, so the OAuth flow cannot be completed here.
- `ToolSearch` for `+linear` returns no deferred tools; `~/.claude.json` lists only `magic`,
  `supabase` and `mobbin` as global MCP servers, and the project `.mcp.json` lists only
  `playwright-test`.

Two P1 findings (`NCR-2026-09-04-01`, `NCR-2026-09-04-02`) therefore exist only as the full records
below. **They need filing by hand, or by the next run once Linear is authorized.** The P3 belongs
under a `Commit review 2026-09-04 — P2/P3 findings` parent that also could not be created.

Authorizing the connector (claude.ai connector settings, or `claude mcp` / `/mcp` from an
interactive session) restores this capability. Until then every run of this task will hit the same
wall.

## Checks run

| Check                                            | Result                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm typecheck` (worktree, full turbo graph)     | **PASS** (exit 0) — no dangling imports from the 100 deleted modules |
| `pnpm vitest run --sequence.shuffle` (myK9Show)   | **PASS** — 1961 files, 18,803 passed / 9 skipped, 250s, exit 0   |
| `packages/core` `pnpm run test --sequence.shuffle --coverage` | **FAIL** (exit 1) — reproduces CI exactly, see NCR-2026-09-04-01 |
| `gh run list --branch main` (trap 2)              | **RED** — CI failing on 6 consecutive head SHAs                 |
| Nightly Health (2026-09-04 11:00 UTC)             | **RED** — root-caused to the harness, see below                 |
| Live DB: migration `20260903150000` applied       | **YES**                                                          |
| Live DB: `replace_judge_qualifications` definition | Self-service arm **absent**                                     |
| Live DB: `judge_qualifications` policies          | INSERT/UPDATE secretary+site_admin, DELETE site_admin only       |
| Live DB: `refresh_class_scoring_state` definition  | `'absent'` still missing from the `entry_status` exclusion list  |
| Dangling-reference sweep over 100 deleted files    | 22 apparent hits, all false positives (see Rejected)            |
| Migration-version-guard ref-scan simulation        | 22 refs flagged for an already-merged version (see NCR-...-02)   |

### Verification limits

- **Behavioural SQL tests have never run locally** (no container runtime on this Mac). The
  MYK9-354 closure rests on CI's `SQL tests` job, which was **green** on `589b06fca`, plus live
  `pg_get_functiondef`.
- The MCP role gets `42501: permission denied for function is_site_admin`, so a definer RPC's guard
  cannot be *called* under a simulated JWT from this connection. Authorization conclusions rest on
  `pg_get_functiondef` + `pg_policy`, which proves a widening but not a call.
- **`NCR-2026-09-04-02` is reasoned + simulated, not observed on a live PR.** No migration PR has
  been opened since the guard merged 18 hours ago, so its first real exercise has not happened. The
  simulation below is decisive about the ref-scan's behaviour; it does not prove the exact GitHub
  Actions ref layout.
- No browser replay this run. `Build`, `Smoke build`, `A11y smoke` and `E2E PR Smoke` have been
  **skipped on every main run for 18 hours** because they are gated on `Test` — so nothing in this
  window has been build- or E2E-verified on `main` at all. That is itself part of NCR-2026-09-04-01.

---

# P1

## NCR-2026-09-04-01 — `main` CI has been red for 18 hours; the coverage gate that catches it does not run on PRs

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Status             | new                                                                      |
| Canonical severity | **P1** (golden-path task — shipping — cannot complete without developer help) |
| Source label       | `source: claude`, `audit:commit-review`                                  |
| First seen         | 2026-09-04                                                               |
| Last seen          | 2026-09-04                                                               |
| Consecutive runs   | 1                                                                        |
| Baseline SHA       | `589b06fca`                                                              |
| Affected role      | All — release/delivery workflow                                          |
| Confidence         | **High** — reproduced locally with byte-identical numbers                |

### Problem statement

`04be60937` ("refactor(packages): complete internal dead-code sweep (MYK9-328)", PR #1990) deleted
2,228 lines from `packages/core`, including the *subjects* of five well-covered test files. Deleting
covered code shrinks the coverage denominator, so the surviving uncovered lines now dominate the
ratio and `packages/core` fell below its own thresholds. `main` CI has failed on every push since.

The PR could not have caught this. `.github/workflows/ci.yml:243` runs coverage only on `push`:

```yaml
run: pnpm test:packages -- --sequence.shuffle${{ github.event_name == 'push' && ' --coverage' || '' }}
```

So a PR that deletes covered code is green by construction, and `main` goes red on merge.

### Evidence

Local reproduction in a clean worktree at `589b06fca`:

```
cd packages/core && pnpm run test --sequence.shuffle --coverage
 Test Files  13 passed (13)
      Tests  253 passed (253)
All files          |   91.64 |    85.41 |   93.22 |   92.62
ERROR: Coverage for functions (93.22%) does not meet global threshold (94%)
ERROR: Coverage for statements (91.64%) does not meet global threshold (92%)
EXIT=1
```

Byte-identical to CI run `33832052383` (`589b06fca`), job `Test packages`.

Thresholds: `packages/core/vitest.config.ts:13-18` — `statements: 92`, `functions: 94`.
Denominator after the sweep: 347 statements, 59 functions.

Red run history on `main` (`Test packages` + the aggregating `Test` job):

| Head SHA    | Run          | Time (UTC)       | Verdict |
| ----------- | ------------ | ---------------- | ------- |
| `d5a495862` | 33743620453  | 2026-09-03 10:18 | success (last green) |
| `1bf735486` | 33786327334  | 2026-09-03 17:44 | failure — same two coverage errors, on a **docs-only** commit |
| `f558bc675` | 33792494952  | 2026-09-03 18:46 | failure |
| `7fcfe1646` | 33798221032  | 2026-09-03 19:44 | failure |
| `e29a10e98` | 33804297211  | 2026-09-03 20:47 | failure |
| `deda679ee` | 33809934074  | 2026-09-03 21:48 | failure |
| `6c99ec946` | 33813969383  | 2026-09-03 22:37 | failure |
| `039af3946` | 33818260794  | 2026-09-03 23:35 | failure |
| `b85bab82d` | 33821412583  | 2026-09-04 00:20 | failure |
| `568eddfb9` | 33824081518  | 2026-09-04 01:00 | failure |
| `7a1f5a8ee` | 33829811221  | 2026-09-04 02:31 | failure |
| `589b06fca` | 33832052383  | 2026-09-04 03:07 | failure |

Attribution is by elimination and is conclusive: `main` was green at `d5a495862`; the first
*completed* run after it that reached `Test packages` (`1bf735486`) failed with the identical
numbers; `1bf735486` is docs-only; and **`04be60937` is the only commit between them that touches
`packages/`**. `04be60937`'s own push run was `cancelled` (superseded), which is why it did not
show the failure under its own SHA.

### Expected vs actual

- **Expected:** a change that reduces package coverage below threshold fails on its PR, before merge.
- **Actual:** the PR is green (coverage is not requested on `pull_request`), `main` goes red on
  merge, and stays red until a human notices.

### Impact

1. **Staging release promotion is stopped.** `deploy-staging.yml:24-26` gates promotion on
   `github.event.workflow_run.conclusion == 'success'`. No SHA has been promoted to the protected
   release refs since `d5a495862`. Twelve commits of merged work — including three offline fixes, a
   money-path fee correction and an RBAC authorization fix — are unpromoted.
2. **Nothing in this window has been build- or E2E-verified on `main`.** `Build`, `Smoke build`,
   `A11y smoke` and `E2E PR Smoke` are all `skipped` on every run because they need `Test`. An 18-hour
   window of merges has had no build gate at all.
3. **Signal loss.** A permanently red `main` trains everyone to ignore it, so the next *real*
   breakage arrives invisible.

### Likely root cause

Coverage thresholds are a ratio, and the sweep changed the denominator, not the numerator. The
`--coverage`-on-push-only shape means the one gate that measures the ratio never sees the change
that alters it.

### Recommended approach

Two parts, and the second is the one that matters:

1. **Unblock `main`.** Either cover the four remaining uncovered functions in `packages/core`
   (`errors.ts:52,96`, `logger.ts:13,26,31`, `network.ts:141-143`,
   `dateFormatting.ts:114,175-207`, `trial-status.ts:55-56,66`) or lower the thresholds to the
   post-sweep reality with a comment saying why. Covering is preferable — these are small.
2. **Close the gate hole.** Run `--coverage` on `pull_request` too, so the check that fails on
   `main` also fails on the PR that causes it. If the cost is the concern, run it only when the PR
   touches `packages/`.

### Acceptance criteria

- `cd packages/core && pnpm run test --sequence.shuffle --coverage` exits 0.
- A `push` run of CI on `main` is green, and `Build` / `Smoke build` / `A11y smoke` actually execute.
- A `Deploy Staging` run reaches `promote` rather than being skipped.
- A deliberate coverage regression on a scratch PR **fails that PR**, not just `main`.

### Required proof for closure

A green `CI` run on `main` at a SHA at or after the fix, showing `Test packages` passed **and**
`Build` no longer skipped — plus the mutation check in the last bullet above. A merge is not
proof.

### Commits / files / related

- `04be60937` (PR #1990) — cause
- `.github/workflows/ci.yml:243` — the gate hole
- `packages/core/vitest.config.ts:13-18` — thresholds
- `.github/workflows/deploy-staging.yml:24-26` — the blocked promotion
- Related: MYK9-328 (the sweep), `docs/qa/myk9-328-package-dead-code-inventory.md`

---

## NCR-2026-09-04-02 — the new migration-version guard will fail every migration PR

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Status             | new                                                                      |
| Canonical severity | **P1** (blocks the whole schema-change workflow; no migration can pass CI) |
| Source label       | `source: claude`, `audit:commit-review`                                  |
| First seen         | 2026-09-04                                                               |
| Last seen          | 2026-09-04                                                               |
| Consecutive runs   | 1                                                                        |
| Baseline SHA       | `589b06fca`                                                              |
| Affected role      | All — any developer landing a migration                                  |
| Confidence         | **High on the ref-scan defect** (simulated on real refs). **Medium on the end-to-end PR failure** — no migration PR has been opened since the guard merged, so its first real run has not happened. |

### Problem statement

`eb07cadc3` ("ci: guard migration versions against shared history", PR #1996) added
`scripts/qa/migration-version-guard.ts`, wired into `Quality Checks`. It is meant to catch the real
trap recorded in `CLAUDE.md` LESSONS — another PR merging the same migration timestamp first. Its
implementation asks a question that does not distinguish that case from the normal one:

```ts
// migration-version-guard.ts:26-38
function refsContainingMigrationVersion(version: string): string[] {
  const refs = execFileSync('git', ['for-each-ref', '--format=%(refname)', 'refs/remotes', 'refs/heads'], …)
  return refs.filter(ref => { /* does this ref's tree contain a file with this version? */ });
}
```

"Does any ref's tree contain this version" is true of **every branch that inherited the migration**,
not only of a rival unmerged claim. Three failure modes follow.

### Evidence

**Mode 1 — the PR's own branch is flagged.** On a `pull_request`, `actions/checkout` puts HEAD at
the merge ref (`refs/pull/N/merge`), while `fetch-depth: 0` (set on `Quality Checks`,
`ci.yml:118-120`) fetches `+refs/heads/*:refs/remotes/origin/*` — so `refs/remotes/origin/<pr-branch>`
exists, contains the new migration, and its SHA is **not** HEAD. The `refSha !== headSha` filter at
`migration-version-guard.ts:64-67` therefore does not exclude it, and `runGuard` pushes
`migration version V also exists on: refs/remotes/origin/<pr-branch>`.

**Mode 2 — stale branches flag an already-merged version.** Simulated against the real repository at
`589b06fca`, using `20260903150000` (merged into `main` yesterday), replicating the guard's exact
git calls:

```
HEAD 589b06fcaba3510e8a41316ac7c36e888fe4323e
refs containing 20260903150000 : 27
  FLAGGED  refs/remotes/origin/claude/myk9-365-reconnect-refetch 69093eb3b
  FLAGGED  refs/remotes/origin/claude/myk9-371-drop-manage-members-arm b72b51af6
  FLAGGED  refs/remotes/origin/codex/myk9-367 927bae837
  … 22 flagged in total, 5 filtered as same-SHA
```

Twenty-two refs flagged for a version that is legitimately on `main`. This repo keeps merged
branches (CLAUDE.md § Worktree rules: merge with `--squash` and **without** `--delete-branch`;
`branch-janitor` reaps remotes weekly), so the flagged set is large and permanent.

**Mode 3 — the live check inverts after deploy.** `liveMigrationCount()`
(`migration-version-guard.ts:41-56`) fails when the version is present in
`supabase_migrations.schema_migrations`. Being present there is the *desired* steady state once the
migration is pushed. Any CI re-run, or any later push touching that migration file, is then
permanently red.

**The unit test cannot see any of this.** `scripts/qa/migration-version-guard.test.ts` covers
`migrationVersion` and `changedMigrationVersions` — two pure string helpers. `runGuard`,
`refsContainingMigrationVersion` and `liveMigrationCount`, the entire risk surface, are untested.

### Expected vs actual

- **Expected:** the guard fails only when a *different, unmerged* ref has already claimed the
  version, or when the version is in the live database **and not yet in this branch's history**.
- **Actual:** it fails when the PR's own branch carries the version (always), when any stale branch
  carries it (usually), and once the migration is deployed (always).

### Impact

No schema change can pass `Quality Checks`. Migrations are on the critical path for RLS, grants,
RPC authorization and every money-path contract, so this stops a whole class of launch work — and it
presents as a mystery red on an unrelated-looking job, which is expensive to diagnose (see the
"stale red" and "no runs at all" LESSONS for how much time that shape has cost before).

### Likely root cause

The guard reasons over *ref trees* when the question is about *history*. "Is this version claimed by
work not in my ancestry" is answerable with `git merge-base --is-ancestor` / `git branch --contains`,
not with "does the file exist on that ref".

### Recommended approach

1. Ignore any ref that is an **ancestor of HEAD** (the version is already merged — not a collision),
   and any ref that HEAD's own branch resolves to.
2. Compare against `origin/main` specifically rather than every ref, or restrict to refs with an
   **open PR**, which is the only population the trap is about.
3. Treat `liveMigrationCount(version) > 0` as an error only when the version is **absent from
   `origin/main`'s tree** — present in both means "already deployed", which is fine.
4. Give `runGuard` a real test: stub the three `execFileSync` seams and assert it stays silent for
   (a) a version only on HEAD, (b) a version merged into `main` and inherited by stale branches, and
   (c) a deployed version already on `main`; and that it fires for a version on a *different*
   unmerged branch. Mutate each arm and confirm the test fails.

### Acceptance criteria

- A scratch PR adding a brand-new migration version passes `Quality Checks`.
- A scratch PR adding a version that a *different* open PR already claims **fails**, naming that PR's
  branch.
- A push to `main` carrying an already-deployed migration passes.
- The `runGuard` tests above exist and each one fails when its arm is mutated.

### Required proof for closure

A green `Quality Checks` run on a real migration PR, plus a red one on the deliberate-collision
scratch PR. Do not close on the unit test alone — that is what missed this.

### Commits / files / related

- `eb07cadc3` (PR #1996)
- `scripts/qa/migration-version-guard.ts:26-38, 41-56, 59-76`
- `scripts/qa/migration-version-guard.test.ts` (covers only the pure helpers)
- `.github/workflows/ci.yml:166-175` (wiring), `ci.yml:118-120` (`fetch-depth: 0`)
- Related: `CLAUDE.md` LESSONS — "Pick a migration timestamp against `origin/main`, not your branch";
  memory `feedback_migration_version_free_in_main_and_live`

---

# P3

## NCR-2026-09-04-03 — new plan docs land without the required status line or index row, and nothing enforces it

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| Status             | new                                                          |
| Canonical severity | **P3** (docs hygiene; does not block launch)                 |
| Source label       | `source: claude`, `audit:commit-review`                      |
| First seen         | 2026-09-04                                                   |
| Consecutive runs   | 1                                                            |
| Baseline SHA       | `589b06fca`                                                  |
| Affected role      | Developer / agent onboarding                                 |
| Confidence         | High                                                         |

### Problem statement

`CLAUDE.md` § Planning requires every `docs/plan-*.md` to carry `> **Status:** Active` directly under
the title and to register one row in `docs/README.md` **in the same edit**. Three plans added this
window carry neither:

- `docs/plan-myk9-354-qualification-contract.md`
- `docs/plan-myk9-366.md` (added by `7bee19c4d`)
- `docs/plan-myk9-369.md` (added by `1d4dcec8c`)

`6858ba9b1` did add an index row for `plan-myk9-361.md`, but as a bullet appended below the
`designs/` reference table rather than as a row in the plan index — and it still omitted the status
line.

Repo-wide: **22 of 78** `docs/plan-*.md` files have no status line. The rule has been drifting for
months because no check enforces it.

### Evidence

```
docs/plan-myk9-354-qualification-contract.md   MISSING
docs/plan-myk9-366.md                          MISSING
docs/plan-myk9-369.md                          MISSING
… 19 more
$ grep -in "361\|366\|369" docs/README.md    # no output
```

### Impact

The status line is how a later agent tells an active plan from an abandoned one. Without it, plans
accumulate and each new session re-reads work that is already finished — the same class of drift
recorded in `feedback_open_todos_drift_stale` (~23% of open todos already shipped).

### Recommended approach

Add a `qa:doc-staleness` assertion (that job already runs in `Quality Checks`): every
`docs/plan-*.md` must match `^> \*\*Status:\*\*` on line 3 and appear in `docs/README.md`. Backfill
the 22 existing files in one pass. A declared check that fails loud beats a convention — see the
LESSON on preferring a declared list over an inferred scan.

### Acceptance criteria

- All `docs/plan-*.md` carry a status line and a `docs/README.md` row.
- Adding a plan file without either fails `Quality Checks`.
- Deleting the status line from an existing plan fails that check (mutation-verified).

### Required proof for closure

The check red on a scratch commit that omits the line, green after adding it.

---

# Unchanged

These were confirmed still unresolved against live state this run. Do not re-file; reference the
existing IDs.

| ID | Linear | Sev | Evidence this run | Next proof |
| -- | ------ | --- | ----------------- | ---------- |
| `NCR-2026-09-03-02` | MYK9-356 | P2 | Deployed `refresh_class_scoring_state` still reads `entry_status NOT IN ('scratched','withdrawn','moved','not_accepted')` — `'absent'` absent. The only `'absent'` occurrence is `result_status IN ('absent','excused')`, a different column. `01fff877b` recorded a research note (`docs/research/2026-09-03-absent-entry-accounting-mismatch.md`), not a fix. | Mutation: reinstating `'absent'` must fail a test |
| `NCR-2026-09-03-03` | MYK9-357 | P2 | `supabase/functions/validate-passcode/rateLimitGate.ts:76-81` still returns `kind: 'allowed'` when `clientIP` is null. No commit in this window touched `validate-passcode/`. | A test asserting not-allowed that fails if the early return returns |
| `NCR-2026-09-03-04` | MYK9-358 | P3 | `20260902180000`'s header still claims a role-name fix that `068` had already made. Superseded in effect by `20260903150000`, but the misleading header stands. | Corrected header |

# Resolved

| ID | Linear | Sev | Proof |
| -- | ------ | --- | ----- |
| `NCR-2026-09-03-01` | MYK9-354 | P1 | Fixed by `29f76327a` (PR #1992). **Deployed:** `supabase_migrations.schema_migrations` contains `20260903150000`. **Live definition:** `pg_get_functiondef` for `public.replace_judge_qualifications` no longer contains `get_my_person_id`, and contains both `is_site_admin` and `has_role`. **Passing focused proof:** CI job `SQL tests` **green** on `589b06fca` (run 33832052383) with `judge_qualification_rpc_authorization_test.sql` registered in both allowlists (`run-behavioral-sql-tests.sh` and its `.test.ts` contract list). Not closed on the merge alone. |

# Duplicate

| Candidate | Resolution |
| --------- | ---------- |
| `computeClubPermissions` grants `canManageMembers` on `isClubAdmin \|\| hasManageMembersPermission`, so a global `club:manage` holder can manage any club's members (`clubPermissions.ts:57`, introduced by `1de4adbc3`) | Already addressed by **open PR #2011**, "fix(clubs): tie canManageMembers to the club-scoped role alone (MYK9-371)". Not filed. |

# Rejected after investigation — do not re-file

1. **`replace_judge_qualifications` lets a secretary clear every qualification row despite
   site-admin-only DELETE RLS.** Real, and **deliberate**. `supabase/tests/judge_qualification_rpc_authorization_test.sql`
   pins it explicitly — line 145 reads "The empty replacement is an authorized save, not direct
   DELETE access", and lines 146-165 assert both that the secretary RPC *can* clear the list and that
   the secretary still has no direct table DELETE. This is the "definer-only edge, not drift" case
   from LESSONS; gating it would revert a decision with a test behind it.

2. **Wizard and cart quote from different fee rates.** `calculateCartTotals`
   (`cartStore.helpers.ts:140-149`) uses the hardcoded `DEFAULT_PLATFORM_FEE_RATES` while
   `deda679ee`'s new `PaymentSummaryCard` uses live `usePlatformFeeRates()`. Not drift — the comment
   at `cartStore.helpers.ts:146-148` states the store-baked preview deliberately uses fallbacks and
   the components apply live rates, and `stripe-checkout` remains authoritative for the charge. The
   new code follows the same pattern.

3. **22 "dangling references" to modules deleted this window.** All false positives: app-local
   namesakes (`@/components/ui/collapsible`, `EntityPageLayout`, `DualTimerDisplay`), stale
   `scripts/fix-*-errors.sh` artifacts, and a stale `myk9q-analysis.json`. `pnpm typecheck` passes
   across the full turbo graph, which is the check that would catch a real one.

---

# Harness / environment class — reported, NOT filed as defects

Per the brief these are tracked separately. Both records below are complete enough to file by hand.

## H-1 — Nightly Health's route-settle assertion strands requests, so one slow read fails every remaining route

**This is the mechanism behind the MYK9-289 recurrence.** Nightly Health has been red on 5 of the
last 7 runs, and the failing *role* migrates between runs — exhibitor on 2026-09-01 and 2026-09-03,
**secretary** on 2026-09-04, with exhibitor clean that day. A migrating failure is the signature of a
timing-dependent harness leak, not a role-specific product bug.

**Root cause.** `watchAppApiRequests` (`apps/myk9show/src/test/harness/appApiRequestTracker.ts:21-45`)
returns a tracker whose `pending` set is created **once per role** — `route-health-by-role.spec.ts:363`
constructs it and passes it into `sweepRoutes`, which loops over every route without ever clearing it.
The loop *does* reset the browser-health arrays each iteration
(`route-health-by-role.spec.ts:215-218`) but not `pending`. Any request still in flight when the next
`page.goto` tears down the document is stranded in `pending` forever, and
`waitForAppApiRequestsToSettle` — whose default budget is 5,000 ms
(`appApiRequestTracker.ts:5`) — then fails for **every subsequent route in that sweep**.

**Evidence.** The 2026-09-04 run (33865556960) reports the *same two URLs* as unsettled on all five
failing secretary routes (`entries`, `reports`, `settings`, `people`, `workbench`):

- `/rest/v1/dog_registrations?select=*&dog_id=in.(…)` — **exactly 100 ids**, URL ≈ 3,940 chars
- `/rest/v1/people?select=id,first_name,last_name,email,phone&id=in.(…)` — **3 ids**

A 3-id `people` read cannot plausibly exceed 5 s on five consecutive routes. Identical URLs repeated
across routes is only possible if the set is never cleared.

The 100-id batch is *correct* — `ID_CHUNK_SIZE = 100` (`apps/myk9show/src/utils/chunkIds.ts:30`),
applied at `services/database/dogs/reads.ts:187`, which is the MYK9-272 fix. So there is no unbounded
`.in()` here; the batch is simply slower than the 5 s budget on a loaded runner, and the strand does
the rest.

**Recommended approach.** Clear `tracker.pending` (and reset `lastActivityAt`) at the top of each
route iteration, or construct the tracker per route. Separately, raise `DEFAULT_TIMEOUT_MS` for this
sweep, or exclude requests whose document has been discarded. Add a regression test that navigates
away mid-request and asserts the next route still settles — the existing
`appApiRequestTracker.test.ts` does not cover the navigation boundary.

**Why this matters beyond the red.** MYK9-289 is marked Done and keeps recurring, because the closure
addressed one role's symptom rather than the shared amplifier. Until this is fixed the nightly cannot
distinguish a real never-settling route from a stranded one, so genuine product signal is being
masked. **A human should reopen MYK9-289 or file this as its own issue** — this run could not.

## H-2 — 252-dog registration search test: RESOLVED

`DogSelectionStep.test.tsx > finds the last of 252 dogs` timed out on `main` at `deda679ee` and
`6c99ec946` (`Test myK9Show (1/3)`). `b85bab82d` (PR #2013) fixed it by replacing `user.type` with
`user.paste` and counting rows via `document.querySelectorAll` instead of a 252-element role query
(14,665 ms → 5,873 ms under the loaded-runner recipe). Confirmed: `Test myK9Show (1/3)` is **green**
on `589b06fca`, and the full local shuffled suite passes 18,803 tests. This is the same
`userEvent.type`-cost trap recorded in LESSONS; the fix is the right shape.

Small note, not a defect: the row count assertion weakened from "252 accessible checkboxes" to "252
checkbox inputs in the DOM". The commit reasons about this explicitly and keeps the two
accessible-name assertions as role queries, so the semantics that matter are still pinned.

## H-3 — `scheduledFailureNotifier.behaviour.test.ts` flake: did not recur

Carried from the 2026-09-03 run as unexplained. Not observed this run: the full shuffled myK9Show
suite passed locally (18,803 tests) and all three CI `Test myK9Show` shards are green on
`589b06fca`. Left open as watch-only — one non-recurrence is not a fix.

## H-4 — Cross-browser route health (advisory): WebKit environment

`Cross-browser route health (advisory)` failed with `UnknownError: An internal error was encountered
in the Indexed Database server` and `Importing a module script failed` under WebKit / mobile-safari.
Advisory job, WebKit-specific storage errors against a dev server. Environment class; not
investigated further this run.

---

# Commits reviewed

Oldest first. `✓` = read in full; `·` = docs/plan/report content read but not analysed for defects.

```
· d17e5749c docs(qa): claude daily commit review 2026-09-03
✓ 5359df474 fix(settings): recheck queues before cache clear (#1991)
✓ 29f76327a fix(auth): restrict judge qualification replacement RPC (#1992)   → resolves MYK9-354
✓ 648a0619b test(auth): pin secretary qualification save permissions (#1994)
· 1d19a08d3 docs: record MYK9-354 completion evidence
✓ 04be60937 refactor(packages): complete internal dead-code sweep (#1990)      → NCR-2026-09-04-01
· 01fff877b docs(research): record absent entry accounting mismatch
✓ 25074b7b0 test(secretary): isolate deliberate exit dirty state (#1993)
· 1bf735486 docs(openspec): archive MYK9-328 cleanup (#1995)
✓ eb07cadc3 ci: guard migration versions against shared history (#1996)        → NCR-2026-09-04-02
✓ f558bc675 ci: shuffle package tests (#1997)
· 7fcfe1646 docs(qa): bug audit scope walk — components, week 36 second pass
✓ 6803cce08 fix(dogs): remove inactive health timeline card affordances (#1998)
· e1569d29d docs: archive completed MYK9-363 plan
✓ ece3d6255 fix(dogs): remove inert secretary verification action (#1999)
✓ 9a5aad14f fix(exhibitor): treat an unsettled profile query as unknown (#2001)
✓ 1edc2f1eb refactor: remove orphaned component residue (#2000)
✓ 1de4adbc3 fix(clubs): authorize the club profile from real grants (#2002)    → dup of PR #2011
· ea518f426 docs: record MYK9-364 merge completion
✓ 6858ba9b1 fix(admin): report create-user role grant failures (#2003)
· 268066f32 docs: archive completed MYK9-361 plan
· e29a10e98 docs: remove trailing blank line after plan archive
✓ 7bee19c4d fix(show-dates): preserve Career calendar dates (#2005)            → NCR-2026-09-04-03
✓ 580393ddf fix(dogs): make registry details readable (#2007)
✓ 8c89cb536 fix(offline): stop reading 'idle' as "first sync still coming" (#2006)
✓ a31e0acea fix(dogs): name the Add/Edit dog sex, owner and photo controls (#2008)
✓ 1d4dcec8c fix(registration): add dog search to entry picker (#2004)          → NCR-2026-09-04-03
✓ deda679ee fix(show): include service fee in registration total (#2009)
· 6c99ec946 docs(ux-audits): preserve the 2026-09-03 exhibitor walk
✓ 039af3946 fix(panels): stop the route guard prompting on a panel's own close (#2010)
✓ b85bab82d test(registration): stop the 252-dog search test timing out (#2013) → H-2 resolved
✓ 568eddfb9 fix(offline): refetch active queries when connectivity returns (#2012)
✓ 7a1f5a8ee fix(admin): make the offline roster state reachable (#2014)
· 589b06fca docs(adr): record cold-offline query semantics
```

## Notes on commits reviewed and found sound

Recorded so the next run does not re-derive them.

- **`568eddfb9`** (`useRefetchQueriesOnReconnect`) — replays the offline→online transition into
  `onlineManager` instead of calling `invalidateQueries()`, which correctly preserves each query's
  own `refetchOnReconnect`. The Ringside entry-list opt-out (mid-drag) is covered by a test with a
  positive control in the same test — the shape the "green test in a dead suite" LESSON asks for.
  The momentary `setOnline(false); setOnline(true)` pair lands in one tick, so no query is left
  paused.
- **`8c89cb536`** — moving the connectivity test *into*
  `areReplicationTablesPendingFirstSync` covers the three call sites that had hand-rolled it wrong,
  and the `status.isSyncing` early return keeps a genuinely running sync bounded. Mutation-verified
  by the author.
- **`7a1f5a8ee`** — correctly identifies that the previous `isLoading && fetchStatus === 'paused'`
  was unsatisfiable by construction, and distinguishes `rosterData === undefined` (never read) from
  `users.length === 0` (read and empty), which is the exact trap in memory
  `project_disabled_query_renders_false_zero`.
- **`039af3946`** — the self-navigation counter is raised around the navigating *call only*, never
  across an `await`, so a slow save leaves the form guarded. Failure direction is fail-safe (the
  prompt still shows). 300 lines of route-guard tests.
- **`5359df474`** — a genuine TOCTOU fix on a destructive action; the confirm click now re-checks the
  queues, and `event.preventDefault()` correctly stops the dialog auto-closing.
- **`04be60937`'s edge-function half** — `supabase/functions/send-confirmation-email/*` changes are
  comment-only; production email HTML is unchanged. The parity test lost its React-Email side, which
  is correct once that side is deleted, not a coverage regression to chase.

---

## Ledger line for automation memory

```
ID | P# | src | status | first/last | runs | evidence | next proof
NCR-2026-09-04-01 | P1 | claude | new (UNFILED) | 09-04/09-04 | 1 | packages/core coverage 91.64/93.22 vs 92/94 reproduced locally byte-identical to run 33832052383; main red 12 commits since 04be60937; --coverage only on push | green main CI incl. Build + a coverage regression failing its own PR
NCR-2026-09-04-02 | P1 | claude | new (UNFILED) | 09-04/09-04 | 1 | ref-scan simulation: 22 refs flagged for merged version 20260903150000; PR HEAD is the merge ref so origin/<pr-branch> is never filtered; runGuard/liveMigrationCount untested | green Quality Checks on a real migration PR + red on a deliberate-collision PR
NCR-2026-09-04-03 | P3 | claude | new (UNFILED) | 09-04/09-04 | 1 | 3 new plans this window lack the status line and README row; 22 of 78 repo-wide; no check enforces it | doc-staleness check red on a scratch omission
NCR-2026-09-03-01 | P1 | claude | RESOLVED (MYK9-354) | 09-03/09-04 | 2 | migration 20260903150000 applied; live functiondef has no get_my_person_id; SQL tests green on 589b06fca | (satisfied)
NCR-2026-09-03-02 | P2 | claude | unchanged (MYK9-356) | 09-03/09-04 | 2 | live refresh_class_scoring_state still omits 'absent' from entry_status exclusions | mutation test
NCR-2026-09-03-03 | P2 | claude | unchanged (MYK9-357) | 09-03/09-04 | 2 | rateLimitGate.ts:76-81 unchanged; no commit touched validate-passcode | not-allowed test
NCR-2026-09-03-04 | P3 | claude | unchanged (MYK9-358) | 09-03/09-04 | 2 | 20260902180000 header still misdescribes | corrected header
```
