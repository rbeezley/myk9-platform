# Daily commit review — 2026-10-22 (Claude failover)

source: claude. **Partial review: 45 of 145 commits completed contiguously; 100 remain. No
confirmed product defect in the completed range.** This is not a clean verdict on all of current
`main`. Two coverage/evidence gaps in the stream itself are reported below and are the most
actionable output of this run.

## Boundary and coverage

- Shared cursor read from the committed row in `docs/qa/audit-boundary.md`:
  `85659c3d0bb49debf25484ba29546918e35046a0`, exclusive; previous window end
  `2026-10-16T20:20:51Z`, run by `codex-daily-commit-review` on 2026-10-22. No 24-hour fallback
  and no gap at the start of this window.
- Frozen baseline / verification SHA: `4c9bbc71ce5848686a1f1f0110a5980e07bbe0d3`
  (`2026-10-23T00:55:35Z`). The requested range `(85659c3d0, 4c9bbc71c]` holds **145 commits,
  1300 changed paths, +52646/−19369**.
- **Completed contiguous review: 45 commits / 464 changed paths, through
  `10eb6bb12b8027de8590567347084d2416da0945`, inclusive. Window end `2026-10-19T20:13:05Z`.**
- **The 100 commits after that endpoint remain unreviewed.** Several of them were inspected
  directly (listed under "Inspected outside the contiguous prefix"), and that inspection does
  **not** count as whole-commit coverage. The cursor advances only to the completed endpoint.
- Isolated worktree: `/private/tmp/myk9-claude-ncr-20261022`, branch
  `claude/ncr-review-20261022`, created from `origin/main`. No application edits, no push to a
  feature branch, no deploy, no shared-fixture mutation, no payment action, no browser session.
  Database access was read-only (catalog and row-count queries only).

### Commits covered, oldest first

`2df0cc0d5` #3077 rejected paper-scoring save · `d49914e9c` #3080 printed placement order ·
`81873a3b8` #3076 My Shows rail/tabs · `381556fd0` #3081 one Add Entry · `b528277e3` #2929
npm-minor-patch bump · `fc13694b0` #3083 Additional Access Request card · `a23e1f195` #3084
Remove-entry test · `f1d2a9468` #3088 Your ring day ordering · `84d182a4d` #3089 matchMedia
reset · `e94b659df` #3090 club card wrap · `2ecfb502a` #3092 browse filters survive an open
record · `84d537dfa` #3091 m:ss.cc rounding · `11af6ad8b` #3079 DQ/EX/ABS/WD labels ·
`2281cfa3f` #3082 2x2 result grid · `1cd8eab7e` #3093 cockpit anchor remount · `2ea6fe68e`
#3087 wizard field errors · `43b3912ad` #3085 class print panel · `dbcda1ce8` #3095 anon-grant
check tightened · `f9add37f3` #3094 manual-status placements · `58eefa1d8` #3097 stalled-sync
test tolerance · `7a7505f76` #3098 integer-ms stored times · `b8b889cba` #3100 armband label
layout · `d0439c038` #3101 "Change class" rename sweep · `d0524ff73` #3102 status-menu copy ·
`77a979f0b` #3099 e2e auth preflight role check · `d5bd937d3` #3104 club registry numbers ·
`ea3c66f34` #3105 types regen · `5848f86b7` #3108 account-pinned stale cleanup · `8c8c973ae`
#3109 base-ui pin · `04660ace0` #3107 vite/playwright pins · `3204f05ec` #3111 class reopen
times · `41e615b5f` #3113 lifecycle-jobs column UPDATE ACL · `f91e68e20` #3116 PWA telemetry in
e2e · `837aa2f88` #3112 lifecycle-email attempt ownership · `bced5550f` #3118 types regen ·
`67032e1ce` #3103 step-up re-auth · `65613ffc8` show-day walk docs · `e424b6069` #3096 batch-3
verification workflow · `5467de61d` #3119 supabase-js bump · `49571fd8e` #3124 label breed and
handler · `45df931df` #3126 print panel portal · `c26d8a2b5` #3127 pulled entry label ·
`adbdc4a41` #3128 DST task timeline · `8a44b6ce6` #3131 log-upload recursion · `10eb6bb12`
#3130 specific-armband parsing.

Lockfiles, generated `database.types.ts` and Playwright/vitest fixtures were read for shape, not
audited as authored implementation. UX-facing changes were read against `docs/INTENT.md`'s
dialog-or-slide-out and status-grammar rules. Schema claims were checked against the applied
database, never against migration text alone.

### Inspected outside the contiguous prefix (not coverage)

`3ba118435` #3135 and `66f1ebf3f` #3136 (one-tap release), `7c88ab310` #3185 (one release /
un-release path), `ae3f04d0b` #3129 (`ScoringConflictHandler` deletion), `87d7ebc07` #3187
(armbands delta), `b31c565cb`/`3331ce020`/`2fbd98f11` (sync cadence), `e0f51f39c` #3176 (RBAC and
identity refresh cadence), `050d84251` #3177, `de98e0b31` #3173, `fc38f76b3` #3198 (dogs replica
paging), `195eedcaa` #3202 and `8c7b828a8` #3211 (promo-code drops), `209240a09`/`f90893491`
#3208/#3205 (entry-count RPC), `af9504d1a` #3204 and `aaf042aa3` #3216 (seed guards),
`855009bd3`/`ca1af9bef`/`e26b5b230` #3207/#3215/#3218 (class judge on the local row), plus all 14
migrations in the window.

## Counts

Lifecycle: **new 0 · unchanged 0 · resolved 0 · duplicate 0 · rejected 4 · blocked 0.**
Canonical severity of confirmed findings: **P0 0 · P1 0 · P2 0 · P3 0.**

Linear: **created 0 · modified 0 · closed 0.** No confirmed non-duplicate finding earned an
issue, so no P0/P1 issue and no `Commit review 2026-10-22 — P2/P3 findings` parent was created.
No Linear write was attempted and none failed. Four candidates were investigated to a verdict and
rejected (below) rather than filed.

Fixes found in later commits: none needed — nothing in the prefix was left broken by it.

## The two gaps that matter

### Gap 1 — three Codex reports exist only as untracked files in `/private/tmp`; two are lost

The committed cursor advanced twice with **boundary-row-only commits and no report on `main`**:
`b52bb337f` (to `a21694dd7`, 2026-10-21) and `478cfca9c` (to `85659c3d0`, 2026-10-22). Per this
task's contract that shape does not prove coverage, so it was investigated rather than accepted:

- `/private/tmp/myk9-ncr-20261020/docs/qa/codex-daily-commit-review-2026-10-20.md` — **untracked**;
  completed `3fab98f7d..48e3616c0`, 16 commits.
- `/private/tmp/myk9-ncr-20261021/docs/qa/codex-daily-commit-review-2026-10-21.md` — **untracked**;
  completed `48e3616c0..a21694dd7`, 20 commits.
- `/private/tmp/myk9-ncr-20261022/docs/qa/codex-daily-commit-review-2026-10-22.md` — **untracked**;
  completed `a21694dd7..85659c3d0`, 20 commits, and states plainly that the 131-commit suffix
  `(85659c3d0, f90893491]` is unreviewed.

So the two stamps **are** backed by real reports with enumerated coverage, and this run honoured
the cursor instead of re-reviewing their range. Their coverage facts are reproduced above and in
this paragraph so the stamp stays provable from `main` if `/private/tmp` is lost.

The 2026-10-18 and 2026-10-19 reports are **not recoverable**: `git worktree list` still lists
`codex/ncr-review-20261018` (`04660ace0`) and `codex/ncr-review-20261019` (`65613ffc8`), but both
working directories are gone and their reports were untracked files inside them. The range
`0952bffb2..3fab98f7d` (**43 commits**) therefore has no published report on `main`, only a cursor
that moved past it. That is a historical coverage gap, named here rather than absorbed.

This is the same failure mode as the 2026-09-15 incident (`docs/qa/audit-boundary.md`
§ Provenance; automation memory trap 1's variant). MYK9-501, which owned the cause then, is
**Done**, so nothing open owns it now. The task's own write budget is the report plus the boundary
row, so this run could not publish the three surviving Codex reports; they need a separate
docs-only commit before those worktrees are pruned.

### Gap 2 — the review backlog is growing faster than any single run can close it

Range size at each of the last four runs: 112 (10-20) → 131 (10-21) → 151 (10-22, Codex) → 145
(this run, after the cursor advanced). Completed per run: 16, 20, 20, 45. At roughly ten merges a
day on `main`, a run that covers 16–20 commits loses ground. This run deliberately covered more
than twice the recent rate and still leaves 100 commits uncovered. The stream needs either a
larger per-run budget, a narrower per-commit depth for presentational changes, or an explicit
decision that only risk-selected commits are covered — the current contract promises contiguous
whole-commit coverage it is not funded to deliver.

Neither gap is a product defect, so per this task's rules neither was filed as one.

## Candidates investigated and rejected

**1. Suspension detection widened from 60 s to 15 min (`e0f51f39c`, MYK9-1308).** `usePersonIdentity`
lost its `refetchInterval: 60_000`; detection now rides window focus/visibility (≥60 s apart),
reconnect, `TOKEN_REFRESHED`/`USER_UPDATED`, or a 15-minute safety net that skips while hidden
(`useRbacLifecycle.ts:251`). Client enforcement is a sign-out in `AuthContext.tsx:99`, and no RLS
policy and no `can_manage_show`/`is_site_admin`/`has_role` definition mentions suspension (checked
live: zero policies match `%suspended%`). **Rejected** because the hard bound is server-side and
unchanged: `public.custom_access_token_hook` returns a 403 `Account suspended` for a suspended
person, `supabase_auth_admin` holds EXECUTE on it (`proacl` verified live), and `jwt_expiry = 3600`,
so a suspended session dies at its next token refresh regardless of the client poll. MYK9-1308's
acceptance criteria explicitly asked to "decide and test the bound", and 15 minutes is inside the
token lifetime. Memory `project_rbac_refresh_intervals` ("roles 5 min, suspension 60 s") is now
stale and was updated.

**2. Secretary dashboard entry count disagrees with the Entries page (`f90893491`, MYK9-1311).**
`get_show_entry_counts` excludes `entry_status = 'moved'` while `get_secretary_live_entry_count`
does not. **Rejected**: `get_secretary_live_entry_count` is used only by
`services/database/entries/secretaryEmptyProof.ts` ("does this show have any entries at all"), and
the Entries page's own total runs through `groupEntriesByEnrollment` →
`buildMoneyAttribution(...).live`, which drops superseded move-ups by the same rule. The two
displayed numbers agree. Live data has **zero** non-deleted `moved` entries, so the question is
currently unobservable either way.

**3. `select('*', { count: 'exact', head: true })` in `getJudgeRosterSummary`
(`services/database/judges/reads.ts:551,553`).** This is the shape LESSONS `postgrest-count-column`
warns about. **Rejected**: introduced 2026-09-03 by `04be60937`, outside this window, and harmless
here — `judge_qualifications` carries no column-level ACLs (live: zero rows in `pg_attribute` with
`attacl`), while the one call that does hit a column-allowlisted table (`judge_assignments`, 12
column ACLs) already uses `select('id', …)`.

**4. A withdrawn entry's pre-withdrawal result still shown to the exhibitor (`c26d8a2b5`,
MYK9-1258).** `isPulledEntry` treats `check_in_status = 'pulled'` and `entry_status = 'scratched'`
as pulled but not `'withdrawn'`. **Rejected on evidence**: both live withdrawn entries carry
`is_scored = false`, `result_status = 'pending'`, `final_placement = NULL`, so neither has a result
to leak, and the domain rule (Withdraw is In Season / Judge Change only, i.e. before the dog runs)
makes a withdrawn entry with a result a data-integrity question rather than a display bug. Worth a
line in a future entry-status audit, not a finding.

## Probes that closed clean

- **All 14 window migrations are applied live** (`supabase_migrations.schema_migrations`:
  20261017014900, 20261017163700, 20261017171300, 20261018023900, 20261018031700, 20261020024300,
  20261020161337, 20261020215300, 20261021175300, 20261022013700, 20261022034100, 20261022034700,
  20261022035300, 20261022131700).
- **Anon ACL contract matches the applied database exactly.** `dbcda1ce8` tightened the
  `/admin/health` anon-grant check to expect `73 column grants` after MYK9-466 revoked anon's 15
  `entries` columns. Live `aclexplode` over `pg_attribute`: **73 total — classes 51,
  judge_assignments 10, dogs 5, people 4, platform_settings 3, entries 0.** The fixture, the
  comment and the database agree, and the change also added a positive control
  ("fails when anon regains any entries column"), so the check cannot pass vacuously.
- **`club_registry_numbers` ACL is what its migration declares**: `anon=r`, `authenticated=arwd`,
  `service_role=arwdDxtm`, RLS enabled **and forced**, no column ACLs — and the monitor allowlists
  (`ANON_TABLE_ALLOWLIST`, `AUTHENTICATED_TABLE_GRANTS`, the applied-ACL fixture) were updated in
  the same commit.
- **`show_lifecycle_email_jobs` UPDATE is genuinely column-scoped** (MYK9-1254): table ACL is
  `authenticated=r` with `w` on exactly `subject`, `body`, `secretary_note`, `status`, `skipped_at`.
  A table-level grant cannot be narrowed by a column grant, and the migration revokes first —
  LESSONS `grant-never-narrows` respected.
- **The three rebuilt entry views kept `security_invoker` inline** (LESSONS
  `replace-view-reloptions`): live `reloptions` are `security_invoker=false`,
  `security_invoker=false`, `security_invoker=true` respectively, matching the migration's recorded
  pre-state; `entries.promo_code_id` is gone; `promo_codes`, `validate_promo_code` and
  `increment_promo_usage` are gone; no code or SQL still references them (the two
  `indexHygieneContract.test.ts` rows are assertions about a historical migration's text, not live
  objects).
- **`armbands.updated_at` and its `BEFORE UPDATE` trigger exist live**, so the MYK9-1300 delta has
  the column it reads; the migration's "no backfill UPDATE" reasoning (it would fire
  `armbands_version_increment` and invalidate every client's OCC token) is correct.
- **`get_show_entry_counts` is `SECURITY DEFINER` with `search_path = ''`, restates
  `can_manage_show()` per show, returns no row (never a 0) for an unmanageable show, and has
  EXECUTE revoked from `PUBLIC`/`anon`** — verified live (`proacl`: postgres, service_role,
  authenticated only).
- **Step-up re-auth is enforced after authorization, before money** in all three refund functions
  (`stripe-refund-entry`, `stripe-refund-show`, `stripe-approve-refund`) and on
  `admin-generate-reset-link`; the Deno-free `stepUpReauth.ts` is byte-identical in both function
  trees; the stripe functions exist only under `apps/myk9show/supabase/functions/`, so there is no
  unupdated second copy; the SQL twin `require_recent_reauth` keeps the same method list, 300 s
  window and 60 s future skew, exempts only a NULL JWT and `service_role`, and the
  `user_roles`/`roles`/`role_permissions` AFTER-ROW triggers return early for any
  `current_user` outside `authenticated`/`anon`.
- **`ScoringConflictHandler.tsx` (608 lines) was safe to delete** (`ae3f04d0b`): nothing in `apps/`
  or `packages/` references the symbol, and conflict surfacing lives in
  `providers/ReplicationSyncProvider.tsx`, which has its own `conflictResurface` and
  `adoptHeldScores` tests.
- **Reopening a class really does clear the finish time on the server** (`3204f05ec`):
  `updateClass` spreads `actual_end_time: undefined` over the local row, and `toSupabaseRow` emits
  `cls.actual_end_time ?? null`, with `stripUnsetServerOwnedKeys` keeping the key because the
  mutation named it — so the queued UPDATE carries `null`, not a dropped field.
- **Unassigning a judge clears the local row** (`ca1af9bef`): `judgeId: judgeId ?? undefined`
  reaches `{...currentClass, ...updates}` as a present key, so the spread overwrites rather than
  preserving the old judge; the new `fieldGroups` merge keeps the five judge fields whole, and
  `normalizeRemoteComparison` is applied to both sides of the "did the server change this?"
  comparison, so a judge the device did not touch is still adopted from the server.
- **`fetchChangedDogs` keyset paging** (`fc38f76b3`) drops the `since` filter only once a cursor
  exists (safe: page 1 was already `> since`), orders on `(updated_at, id)` to match its `or(...)`
  predicate, de-duplicates by newest row, and breaks on a short page. `POSTGREST_MAX_ROWS = 1000`
  matches `supabase/config.toml`'s `[api] max_rows`. With 78 live dogs the paging path is not yet
  exercised in production.
- **The post-seed wait-list guard has a positive control** (`aaf042aa3`): the check fails loudly if
  the seeds left no waiting row, and a rolled-back inner block proves the cron path _can_ promote
  when `waitlist_auto_offer` is on — so the assertion cannot certify a vacuous pass (LESSONS
  `mutation-actually-mutated`).
- **The batch-3 verification workflow runs `verify-artifact-secrets.ts` before uploading**
  (`e424b6069`), so the MYK9-1057 trace-token guard covers the new artifact.
- **Label and time helpers carry known-answer tests**: `labelFontSize.test.ts` pins an exact 103px
  for three digits on a 1-1/3" label and asserts no overflow across three templates and 1–5 digits;
  `parseArmbandSelection` returns _no_ ranges on a typo, so a mistyped selection prints nothing
  rather than every armband.

## Checks run

| Check                                                                                                                                                                                                                             | Result                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm typecheck` (worktree, 26 projects)                                                                                                                                                                                          | **EXIT=0**, 1m07s                        |
| `pnpm --filter @myk9/replication exec vitest run`                                                                                                                                                                                 | **EXIT=0** — 71 files / 851 tests passed |
| Targeted app vitest, batch 1 (judge local row, judges reads, RBAC refresh cadence, manual-release timing, results placement, class placement contract, scoring types/mappers, secretary dashboard, DQ view source, index hygiene) | **EXIT=0** — 18 files / 274 tests passed |
| Targeted app vitest, batch 2 (anon-grant checks, applied-ACL checks, step-up parity, step-up feature, format/searchTime, reports utils, ring day ordering, results hide, armbands delta, server roster read)                      | **EXIT=0** — 30 files / 499 tests passed |
| `gh run list --branch main` + job rollup on the baseline CI run (39881038630)                                                                                                                                                     | **all green**, SQL tests included        |
| Live read-only SQL (applied migrations, table/column/function ACLs, view `reloptions`, trigger presence, row counts, suspension enforcement path)                                                                                 | all consistent with the migrations       |
| Worktree bootstrap (`scripts/bootstrap-worktree.sh`)                                                                                                                                                                              | **EXIT=0**                               |

`main` is green at the baseline SHA, so automation-memory trap 2 ("a green CI on each merged PR
does not mean `main` is green") closed clean this run.

## Verification limits

- **100 of 145 commits were not reviewed.** Everything after `10eb6bb12` is uncovered.
- No behavioural SQL was executed locally (no container runtime on this Mac); the window's SQL
  packets are known to have run in CI only because the baseline CI run's `SQL tests` job is green.
- No browser walk, no E2E replay, no deploy, no payment action, no shared-fixture write.
- No shuffled vitest run: this review added no tests.
- The `custom_access_token_hook` wiring lives in the Supabase dashboard, not in migrations or
  `config.toml`. The function and its `supabase_auth_admin` EXECUTE grant were verified live, which
  is a necessary but not sufficient proof that GoTrue is configured to call it. A deliberate
  suspend-then-refresh replay on staging would settle it; that is an operator action, not one this
  run may take.
- Generated artifacts (`database.types.ts`, `pnpm-lock.yaml`) and the three dependency bumps in the
  prefix were read for scope, not audited dependency by dependency.

## Stamp

`10eb6bb12b8027de8590567347084d2416da0945` / `2026-10-19T20:13:05Z` /
`claude-daily-commit-review` / `2026-10-22`. The next run starts there, not at the baseline SHA.
