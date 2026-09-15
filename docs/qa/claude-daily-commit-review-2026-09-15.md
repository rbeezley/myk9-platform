# Claude daily commit review — 2026-09-15

> **Status:** Reference

## Window and outcome

- Source: **claude**; automation `claude-daily-commit-review`; methodology `quality-finding-lifecycle`.
- Shared cursor on `origin/main` (exclusive): `c660131f5d091fe5f7e5972edf5493b2af44bc6d`, stamped 2026-09-11T10:12:28Z by `codex-daily-commit-review`.
- Reviewed endpoint / baseline: **`738a5a6cfe7cd7d1431f03f738da5729989100c0`** (2026-09-15T08:31:51Z). Final fetch matched this tip.
- **88 first-parent commits** sit between the cursor and the endpoint. They split into two coverage classes, described under _Coverage_ below.
- **No P0 or P1 defect found. No product, security, data-flow or UX/intent regression confirmed.** One new P3 documentation-consistency defect filed. Two previously open findings confirmed resolved with independently reproduced proof.

| Lifecycle                   | Count |
| --------------------------- | ----: |
| New                         |     1 |
| Unchanged                   |     0 |
| Resolved (proof reproduced) |     2 |
| Duplicate                   |     0 |
| Rejected                    |     1 |
| Blocked / reference-only    |     2 |

Outstanding observations from this run: **P0 0 / P1 0 / P2 0 / P3 1.** This is a scoped audit of the reviewed range, not a census of open launch work.

Linear writes this run: **1 issue created** — [MYK9-552](https://linear.app/myk9-platform/issue/MYK9-552/commit-review-2026-09-15-p2p3-findings) (`Commit review 2026-09-15 — P2/P3 findings`, labels `Claude` + `Bug`). No issues closed, no priorities changed, no existing descriptions modified. No Linear write failed.

## Coverage

The cursor was **four days stale**. Reconstructing why matters more than the delay itself.

### Class A — reviewed by Codex, never published (23 commits, `c660131f5..de90d1b0b`)

Codex ran the 2026-09-12 and 2026-09-13 reviews to completion. Neither report ever reached `main`. Both still exist only as **uncommitted files in two retained worktrees**:

- `/private/tmp/myk9-ncr-review-20260912` — `docs/qa/codex-daily-commit-review-2026-09-12.md` staged
- `/private/tmp/myk9-ncr-review-20260913` — both the 09-12 and 09-13 reports staged, plus `findings.md` and an `audit-boundary.md` stamp

The cause is already filed and open: **[MYK9-501](https://linear.app/myk9-platform/issue/MYK9-501)** — a local Codex `PreToolUse` hook runs lint/typecheck in the unrelated **dirty primary checkout** instead of the selected worktree, so a clean docs-only commit is blocked by another checkout's failures.

This run **read both reports in full** and honoured their finding IDs and baselines rather than re-reviewing the range or re-minting IDs. Their commit inventories are reproduced under _Class A inventory_ below so that coverage of those 23 commits is provable from `main` even if the two worktrees are lost — which is the live risk here, since nothing outside `/private/tmp` records it.

**This is a publication gap, not an unreviewed interval.** It is reported, not silently absorbed.

### Class B — uncovered, reviewed by this run (65 commits, `de90d1b0b..738a5a6cf`)

553 files, +42,758 / −12,022. This is the range this report reviews. No further gap exists between Class A's endpoint and Class B's start; the two are contiguous.

## Ranked findings

### P0 — none

### P1 — none

### P2 — none new

Two open P2 items are **referenced, not re-filed**:

- **[MYK9-501](https://linear.app/myk9-platform/issue/MYK9-501)** (Todo) — the publication blocker above. Harness/tooling defect, not an application defect, so per this task's contract it is reported here rather than filed as a product defect. Unchanged since 2026-09-13; this run is its third consecutive observation.
- **[MYK9-544](https://linear.app/myk9-platform/issue/MYK9-544)** (Backlog) — review-gate debt ledger. See _Verification limits_.

### P3 — one new

**NCR-2026-09-15-01 — `view_public_entry_results` COMMENT contradicts the deployed view body.** Full record, evidence, acceptance criteria and closure proof are in [MYK9-552](https://linear.app/myk9-platform/issue/MYK9-552/commit-review-2026-09-15-p2p3-findings). Summary:

`20260913131500_harden_public_entry_metadata.sql` added `AND c.results_released_at IS NOT NULL` to the view's top-level `WHERE`, so unreleased classes now yield zero rows — while the `COMMENT` written in the same migration states that unreleased classes still expose class/show identifiers with entry fields NULLed. The ~18 per-column `CASE WHEN c.results_released_at IS NOT NULL` guards are consequently unreachable branches.

No current exposure: the deployed view is **stricter** than its comment claims. The risk is directional — this is an owner-run (`security_invoker = false`) view whose body is the only guard, so a maintainer trusting the comment could delete the `WHERE` predicate as redundant and reopen exactly the surface MYK9-466 closed. Verified against the applied database, not migration text.

### Rejected

**Two positional path filters silently passing under Vitest 5.** Investigated after `pnpm vitest run src/utils src/features/payments` returned no files; CLAUDE.md warns that vitest 4 finds nothing with three or more filters, and the workspace migrated to Vitest 5 in this range (`bcddfc915`). **Rejected — not a defect.** The two-filter form exits **1** with `No test files found, exiting with code 1`; it fails loudly, it does not report a vacuous green. Single-filter runs collect normally (`src/utils` 51 files, `src/features/payments` 36 files).

## Resolved — closure proof independently reproduced

Neither was resolved from a code change alone; focused proof was executed this run.

### MYK9-467 — TV board hid refresh failures behind cached content

Codex recorded this open on 2026-09-12 and again on 2026-09-13 (two consecutive reproductions: cached class retained, board still reading `Live • 1 class active`, no failure notice). Fixed in-range by `72b340527` ([PR #2202](https://github.com/rbeezley/myk9-platform/pull/2202)).

Proof reproduced: `pnpm vitest run src/pages/TVDisplay` → **9 files / 55 tests passed, exit 0**. The fix is behavioural, not cosmetic — `TVDisplay/TVRefreshNotice.tsx` renders `Updates delayed. Showing the last board update while we try to refresh.`, `index.tsx:192` replaces the misleading Live label with `Reconnecting... • Updates delayed`, and three tests assert `getByRole('status')` carries `/Updates delayed/i` across the active-query, results-query and podium branches at both layout widths. That is MYK9-467's stated closure contract. Already `Done` in Linear (2026-09-13); no state change made.

### MYK9-466 — anonymous entry-table access

Fixed in-range by `5c4eb6e69` ([PR #2195](https://github.com/rbeezley/myk9-platform/pull/2195)). Its closure criterion explicitly required ACLs verified **against the applied database with `pg_attribute.attacl`, not migration text** — so this run checked the live database rather than trusting the merge:

- `pg_attribute.attacl` on `public.entries`: **54 columns, every one `authenticated=r/postgres`. No `anon` grant on any column.** The pre-existing `anon` allowlist (14 columns, plus the `deleted_at` tombstone grant) is gone.
- `pg_class.relacl` on `public.entries`: `postgres` / `authenticated=awd` / `service_role`. No `anon`.
- The embed-availability trap (LESSONS `#postgrest-embed-grants`) does not fire: the anon TV path goes through the `tv_board_entries` RPC, not an `entries` embed, and the anon class path reads the owner-run view.

Already `Done` in Linear (2026-09-13); no state change made.

## Fixes found in subsequent commits

Beyond the two above, no candidate defect identified in the reviewed range survived a check against later commits, current `main`, `docs/qa/findings.md` or Linear. Four candidates were opened and closed during review:

1. **`REVOKE ALL ON public.entries FROM PUBLIC` stripping authenticated access.** Not a defect — `authenticated` holds explicit grants (`20260616120000` SELECT, `20260730220000` INSERT/UPDATE/DELETE), confirmed live as `authenticated=awd` plus per-column `r`.
2. **One-registry trigger deadlocking organisation edits.** The enforcement trigger reads `shows.organization` and would reject every cascade write if the sync trigger were `BEFORE UPDATE`. It is `AFTER UPDATE OF organization` (`20260701120000`), so the row is already current. Verified live: both triggers installed and enabled, and `trg_enforce_show_registry_on_trial` is correctly column-scoped to `registry_id, show_id`.
3. **The pre-existing cross-registry show blocking edits.** `20260915163500` is deliberately additive and names one violating fixture (Heartland, AKC show carrying UKC and ASCA trials). A live query for shows whose trials disagree with their derived registry returns **zero rows** — the seed correction landed, so no live row is now un-editable.
4. **`confirmationNumber` losing its payment-intent fallback** in `lib/stripe.ts`. Not a regression — `CheckoutSuccessPage.tsx:46` renders `Payment reference: …` precisely when a `paymentReference` exists and no `confirmationNumber` does. The fallback is preserved and correctly relabelled.

## Checks run

All from the dedicated worktree `.worktrees/daily-review-20260915` at `738a5a6cf`. Exit codes captured by redirect, never through a pipe (LESSONS `#pipe-exit-code`).

| Check                                          | Result                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test` (full app suite, `apps/myk9show`)  | **2094 files passed, 1 skipped; 20283 tests passed, 9 skipped. EXIT=0** |
| `pnpm typecheck` (root, all 26 tasks)          | **26 successful / 26 total. EXIT=0**                                    |
| `pnpm vitest run src/pages/TVDisplay`          | 9 files / 55 tests passed, exit 0                                       |
| `pnpm vitest run src/utils`                    | 51 files / 558 tests passed                                             |
| `pnpm vitest run src/features/payments`        | 36 files / 396 tests passed                                             |
| `pnpm vitest run src/pages/MyEntriesPage`      | 37 files / 659 tests passed                                             |
| `pnpm vitest run src/services/database`        | 66 files / 541 tests passed                                             |
| `pnpm vitest run src/features/registration`    | 7 files / 56 tests passed                                               |
| `pnpm vitest run src/routes`                   | 3 files / 12 tests passed                                               |
| `check-dist-fresh` (runs ahead of `pnpm test`) | every built package newer than its `src/`                               |

The worktree jest-dom artifact recorded in automation memory (~48 failures in a worktree while `main` and CI are green) **did not occur** on this run; the worktree suite was fully green.

### Applied-database verification (read-only)

| Object                                                                     | Verified state                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase_migrations.schema_migrations`                                    | all six in-range migrations applied: `20260913011500`, `20260913131500`, `20260914001837`, `20260914174500`, `20260914184500`, `20260915163500` |
| `public.entries` column ACLs                                               | 54 columns, `authenticated=r` only; no `anon`                                                                                                   |
| `public.entries` table ACL                                                 | `authenticated=awd`; no `anon`                                                                                                                  |
| `public.view_public_entry_results`                                         | `reloptions = security_invoker=false` (survived the `CREATE OR REPLACE` — LESSONS `#replace-view-reloptions`); `relacl` includes `anon=r`       |
| `public.derive_registry_id`                                                | `authenticated=X` present — the nested-call grant the migration reasoned about is live; `anon` revoked                                          |
| `public.enforce_show_registry_on_trial`                                    | `SECURITY DEFINER`, no `authenticated`/`anon` EXECUTE (trigger-only)                                                                            |
| `public.tv_class_entry_counts`                                             | `SECURITY DEFINER`, `anon` + `authenticated` EXECUTE                                                                                            |
| `trg_enforce_show_registry_on_trial` / `trg_sync_trial_registry_from_show` | both installed, both enabled, enforcement trigger column-scoped                                                                                 |
| cross-registry shows                                                       | zero rows                                                                                                                                       |

No write, DDL, deploy, `db push`, or function deploy was performed. No credentials, tokens, PII or connection strings appear in this report.

## Review notes

The reviewed range is dominated by **fix and consolidation commits closing findings from earlier audits**, which is consistent with the pre-launch "consolidate, don't duplicate" phase in `CLAUDE.md`. Several are deletions — the duplicate calendar page, the orphan notifications page, the unused preloading registry, the exhibitor route retirement — which that phase treats as a feature.

Quality of the in-range work was high enough to be worth recording, because it is why this review found so little:

- **`utils/effectivePaymentStatus.ts` (MYK9-495)** collapses a rule that four consumers had each written as `enrollment ?? entry`. The precedence is an explicit ordered list with a comment per branch, and a first-round adversarial review inside the PR had already caught three P1s in its own first attempt (symmetric precedence reopening waived/refunded entries for a sibling's debt; the financial report keeping a local reimplementation; `groupEntriesByEnrollment` taking a group's status from whichever entry iteration reached first). I probed the remaining branch — an entry in a settled disposition losing to a disagreeing order — and it is unreachable: `entries.payment_status` is `CHECK (… IN ('pending','paid','refunded','waived'))`, so `partial_refund` and `paid_by_check` cannot occur on the entry side, which is exactly the premise branch 5's comment relies on.
- **`20260915163500_enforce_one_registry_per_show.sql`** closes the traps its own header names: `IF NOT FOUND` rather than a sentinel `INTO` target (which would be NULL, not false, on zero rows), deliberately not `STRICT` so a NULL organisation derives `AKC`, an `EXECUTE` grant to `authenticated` because the nested call inside the `SECURITY INVOKER` sync trigger runs as the caller, a column-scoped `UPDATE OF`, and rebuilt from the latest migration defining the function (LESSONS `#replace-function-latest`).
- **The seed-safety cluster** (`10827e506`, `4145cfdaf`, `9c907193a`, `63fb683c9`, `104753235`) is five commits on one guard, which normally reads as a guard that keeps missing cases. It is not: `seedDemoSelfCleaningRelationshipDeleteContract.test.ts` enumerates cascade parents from `pg_constraint confdeltype='c'` and pins placement ahead of every cascading delete. Where the guard is deliberately narrow it leaves a **tripwire** rather than silent incompleteness — the `enrollments` arm is scoped by `show_id` only, sound solely because the seed deletes no people, and the test asserts `DELETE FROM public.people` is absent so the arm must be widened before that ever changes. That is the LESSON applied rather than restated.
- **`scripts/qa/review-tier.ts`** fails safe: unrecognised paths and an empty file list both floor at `adversarial`, documentation is the only `none`, and `docs/agents/shared-rules.md` is matched by `INDEPENDENT_PATTERNS` **before** the `^docs/` rule — so the one rulebook cannot be edited at the docs tier.
- **`lib/stripe.ts`** now sends `session_id` on `cancel_url`, closing a real money-UX defect: Stripe's cancel URL is reachable after a completed payment, so a charged exhibitor pressing Back was told their payment was cancelled, one click from paying again.

`docs/INTENT.md` was read before the UX-facing pass. The in-range UX changes (dialog containment and topmost-only Escape, sticky-header repair, dog-first My Shows cards, the numbered-rail wizard, class-chip disambiguation) move toward the calm/simple platform personality and the exhibitor's "this respects my time"; none removes or contradicts an `// INTENT:` comment.

## Verification limits

Stated plainly: a skipped or blocked check is a coverage gap, not a pass.

1. **Five of the 65 reviewed commits merged without independent cross-harness review.** Codex's usage limit was exhausted from 2026-09-14 until 2026-09-19T05:01Z, so PRs on `independent`-floor paths merged on **owner overrides** with adversarial Claude lenses standing in — [#2246](https://github.com/rbeezley/myk9-platform/pull/2246) (`lib/stripe.ts`, `CheckoutCancelPage`), [#2250](https://github.com/rbeezley/myk9-platform/pull/2250), [#2255](https://github.com/rbeezley/myk9-platform/pull/2255) (`CLAUDE.md`), [#2256](https://github.com/rbeezley/myk9-platform/pull/2256) (`scripts/qa`, `.github/workflows/ci.yml`), [#2260](https://github.com/rbeezley/myk9-platform/pull/2260) (`review-gate.ts`, `.claude/skills/ship-pr`, `review-gate.yml`) and [#2259](https://github.com/rbeezley/myk9-platform/pull/2259). Tracked in [MYK9-544](https://linear.app/myk9-platform/issue/MYK9-544). **This review does not discharge that debt** — I am a Claude automation, and the repository's own rule is that a same-harness review is never sufficient by itself. I read the `lib/stripe.ts` and `review-tier.ts` diffs directly and found no defect, but that is one more Claude lens, not the independent one MYK9-544 requires.
2. **No behavioural SQL test was executed.** `supabase/tests/` runs only in CI — there is no container runtime on this machine. Three SQL packets landed in range (`submit_entries_started_class_test.sql`, `one_registry_per_show_test.sql`, and the updated `anon_tv_entry_soft_delete_test.sql`); registering them is not the same as having run them. Live-database verification above is schema/ACL introspection, not behavioural replay.
3. **No browser or E2E replay.** No Playwright run, no signed-out cold-session walk. MYK9-466's browser-replay criterion and MYK9-467's recorded browser failure/recovery criterion remain outside what this run proved; both were closed on evidence recorded elsewhere.
4. **No deployment, payment, refund, backup-dispatch or load-rehearsal action.** No Stripe session was opened and no money path was exercised end to end.
5. **The 23 Class A commits were not re-reviewed.** Their coverage rests on the two unpublished Codex reports, which this run read but cannot publish — the task permits only two repo writes, and those reports are not among them.
6. **`pnpm qa:code-quality-ratchet` was not run.** This review changed no application code, so the ratchet has nothing to measure.
7. The vitest run was **not** shuffled. `--sequence.shuffle` guards tests this review added; it added none.

## Class A inventory (Codex 09-12 / 09-13, reviewed but unpublished)

Recorded here so `main` carries the coverage record independently of `/private/tmp`.

**09-12, `c660131f5..69f61d921` (9 commits):** `17b4fb7a3` (prior audit docs); `cf05cbb5e` #2170 (set-based public result visibility); `ec9cfb251` #2172 (trial/class preset precedence); `1680cf944` #2173 (browse discipline embed, header/anchor/404); `e3e4bb9c1` #2175 (TV failure vs empty states); `e16745bca` #2177 (inflight stale-branch inventory); `bcddfc915` #2176 (Vitest 5 migration); `d4cb4941c` #2178 (offered-classes premium section); `69f61d921` (security audit evidence). Outcome: 2 new P2 observations (MYK9-467, MYK9-466), 1 resolved, 1 blocked.

**09-13, `69f61d921..de90d1b0b` (14 commits):** `2f99f733f` #2181; `f3fb00874` #2182; `f6638eceb` #2184; `7f2e40f86` #2185; `f8f6d9ac2` #2180; `01abbb75e` #2188; `c89d5180e` #2190; `38a3aaa4b` #2189; `22855254c` #2191; `681afb41c` #2192; `5c7fadd66` #2193; `35308052d` #2194; `a752cda22` #2197; `de90d1b0b` (exhibitor walk evidence). Outcome: 1 new (MYK9-501), 2 unchanged, 7 resolved, 2 duplicate-to-canonical, 2 blocked. P0 0 / P1 1 (MYK9-495, since fixed in Class B by `f26bd35a4`).

## Class B inventory (65 commits reviewed this run)

`738a5a6cf` `4800ec108` `f671b272a` `e48bd6c36` `104753235` `212e98c69` `1ee4e8624` `c03048173` `63fb683c9` `504f0fd71` `e488645b2` `f05104240` `009339a04` `9c907193a` `e4a3d4f4a` `dd5f5ccef` `c4f99d2c8` `bda9eff90` `754091222` `4145cfdaf` `ca070712d` `10827e506` `36e8de4a2` `52d46b9b4` `74203a5ef` `057d24d75` `65c049451` `0ffe88d4e` `85e1e305a` `06bc1709b` `cb6a40eac` `f26bd35a4` `bfd317284` `672f00f59` `d4f87a870` `5745cfe38` `b607c21ed` `e47d80eaf` `dd4f4303d` `83647237d` `79f31cbd5` `1474a1e8f` `51d2ca4cb` `bed1b5b41` `187940adc` `352faa6ed` `1d5b20dc3` `02a3d9504` `84c0ea9c7` `8ebb71b5d` `f4e43f83a` `25dafeb18` `cd9d8032d` `2eff228d0` `d1dce915b` `5c4eb6e69` `7ac22a813` `79e6da3a3` `72b340527` `edd64081c` `67714f6ad` `0a802a7a7` `dfaeded9b` `b2932234f` `5bd40c2c1`

No application file was modified by this audit. This report and the `audit-boundary.md` stamp are its only repo writes; this documentation commit is itself outside the reviewed range and belongs to the next run.
