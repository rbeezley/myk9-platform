# CLAUDE.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Agent skills

### Issue tracker

Linear (workspace `myk9-platform`, issue prefix `MYK9-*`). See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`, extended with `docs/INTENT.md` for UX-facing work. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Self Learning

When I correct you or you catch yourself making a mistake, before continuing, add the lesson as a one-line rule under LESSONS so it never happens again.

A LESSON may be **retired** once the trap is structurally impossible — a guard, test, lint rule, or type now catches it, or the code path no longer exists. Delete the line and cite the PR that made it unreachable in the commit message. LESSONS is for traps only a human could have known about; anything a check already enforces is noise.

## LESSONS

- This project does not use Docker; use the configured Supabase/staging workflows for database and browser verification instead.
- Never move a Linear issue to Done from a `list_issues` result — it TRUNCATES descriptions, hiding acceptance criteria below the fold. `get_issue` the full description and check every AC first (MYK9-182 was closed on toggle state alone while three device-verification ACs sat in the truncated half).
- CI runs vitest with `--sequence.shuffle` (`.github/workflows/ci.yml`); local runs do not. A test that leaks state into another therefore passes every local run — including the full suite — and fails **randomly** in CI, reddening `main` with no code change to blame. Both 2026-08-02 incidents were this: MYK9-170 (module-scope `lastContainmentUntil` memo, whose hook even exported an unused `__resetContainmentMemoForTests`) and MYK9-172. Run any test you add or touch with `--sequence.shuffle` **6+ times** before merging — one pass proves nothing — and reach for a `beforeEach` reset, not a product change.
- Shuffled fast runs are NOT enough for a **timeout**-class flake — those need shuffle order AND a slow environment to surface, so replaying the CI seed on a fast Mac passes and "6+ shuffled runs" stays green while CI keeps failing. Reproduce with `taskpolicy -b pnpm vitest run <file> --coverage --sequence.shuffle` (efficiency cores + coverage instrumentation ≈ a loaded CI runner; 3/8 runs failed where plain runs were 0/N). And the `beforeEach` reset itself must be **O(1) in the leaked state's size** (`store.clear()`, not per-row deletes) — a reset that scales with the accumulation just moves the same timeout into the hook, which also has a 10s cap (ReplicatedClassesTable.test.ts, runs 32169874699/32178459045).
- `git branch -D`/`-d` and `git checkout -- <path>` are DENIED by permission rules here. Interactively that is a prompt; in a scheduled/unattended run it is a silent stall. Discard changes with `git apply -R` or `git restore`, merge with `gh pr merge --squash` WITHOUT `--delete-branch` (its local half fails anyway while a worktree holds the branch), and leave local branches for `branch-janitor` to report.
- `supabase functions deploy --workdir apps/myk9show` follows that dir's `.temp/project-ref`, which once held the defunct `myK9Show-Working` ref — the deploy-to-the-wrong-project trap this rule was written for. **That premise no longer holds:** since #1582 (2026-08-02) the file is _tracked in git_ carrying the correct `sojmvhhwsjxmfistvzbe`, so every clone starts correct and a local `supabase link` that rewrites it now shows up in `git status` instead of drifting silently. Two consequences. (1) Do NOT "tidy up" the tracked `apps/myk9show/supabase/.temp/*` files just because `.gitignore` lists `**/supabase/.temp/` — gitignore does not apply to already-tracked files, and untracking them re-arms the original trap. (2) Still pass `--project-ref sojmvhhwsjxmfistvzbe` explicitly and confirm the "Deployed Functions on project ..." line names the right ref: the flag is free, the file is only correct by accident of that commit, and a deploy to the wrong project is not cheap to undo.
- `codex review --commit <SHA>` reviews ONLY that one commit — on a multi-commit PR, run it per code commit (or against the range); reviewing the branch tip alone can hit a docs-only commit and vacuously pass.
- If work flagged as a background-task chip gets absorbed into the current session (e.g., it turns out to block the main task), dismiss the chip IMMEDIATELY — before continuing — or the user may start it and duplicate the work (PR #1441/#1442).
- When adding a `docs/plan-*.md`, add its status line and `docs/README.md` index row in the same edit.
- Test runners here use hand-maintained ALLOWLISTS, not globs — a new test file passes locally (you named it directly) and then never runs in CI. Register it: edge-function tests in **BOTH** `apps/myk9show/vitest.config.ts` `test.include` **and** `apps/myk9show/tsconfig.edge-tests.json` `include`, behavioral SQL in BOTH `scripts/qa/run-behavioral-sql-tests.sh` `TEST_FILES` and its `.test.ts` contract list. The edge pair is the nastier one because the two failures look nothing alike: miss vitest and the test never runs; miss the tsconfig and it runs green forever while `pnpm typecheck:edge-tests` never sees it, so broken test code is transpiled and passes. **MOVING** a registered test deregisters it from both — `deliver-trial-packet/*.test.ts` stopped reaching `delivery.test.ts`/`email.test.ts` the moment they moved to `_shared/trialPacket/`. Hit three times now (#1541, #1550, MYK9-228 phase 3).
- A PostgREST **count** must name a column, never `*`, on any column-allowlisted table: `select('*', { count:'exact', head:true })` on `public.entries` returns **403 with an empty message body** even though `head:true` returns no column values — the allowlist has no table-level SELECT, so `*` asks for columns the role cannot read. Use `select('id', …)`. React Query masks the throw as a retry, and if the tab is unfocused `canContinue()` is false so it parks at `fetchStatus:'paused'` forever — it looks like an offline bug, not a permissions one.
- PostgREST requires table-level SELECT on every EMBEDDED relation — revoking anon on a table only ever reached via `table(col,...)` / `table!inner(...)` embeds turns a null embed into a hard 42501 that fails the WHOLE request. Grep for embeds, not just `.from('table')`.
- A "missing" column is NOT automatically drift — before writing a repair migration, check `supabase_migrations.schema_migrations` AND recently merged PRs for a deliberate `drop_*`. A stale branch makes an intentional deletion look like an unapplied migration; re-adding the column silently reverts merged work (nearly happened with `20260725200000_drop_early_adopter_until`, already removed by #1470).
- `tsc` errors about generated DB types (`Database['public']['Tables'][...]`) can come from a STALE `packages/supabase/dist/index.d.ts`, not your code — rebuild `pnpm --filter @myk9/supabase build` before believing them. Same built-`dist` trap as the app-test rule, but it produces a false FAILURE rather than a false pass.
- Migration-parsing tests (e.g. `anonEntriesGrantContract`) read the whole `supabase/migrations/` directory, so an UNTRACKED scratch `.sql` left there fails them with a confusing ACL error. Keep experiments out of that directory.
- `SlideOverPanel`'s `size` prop is currently inert — a fixed `sm:/md:/lg:/xl:` chain overrides the size-derived width at every breakpoint, so all panels render the same. Override via `className` for a single panel; see MYK9-99 before "fixing" it globally.
- Pick a migration timestamp against `origin/main`, not your branch — `migrationVersionUniqueness` only sees your own tree, so a version another PR merged first passes every local check and then dies in CI at `INSERT INTO supabase_migrations.schema_migrations` ("Failed to execute statement", no filename in the error). `git fetch origin main && git ls-tree --name-only origin/main supabase/migrations/ | tail` before naming the file, and re-check after any long-running branch (#1533 collided with `20260730190000_fix_ukc_hd_levels`).
- An ACL audit that covers only tables and columns is incomplete — **no migration in this repo has ever GRANTed a sequence privilege** (every sequence statement is a REVOKE), so all three public sequences reach a migrations-only rebuild owner-only while live holds them from `ALTER DEFAULT PRIVILEGES`. A table INSERT grant is worthless if an invoker-run trigger's `nextval()` is not granted: `enrollments` INSERT dies 42501 "permission denied for sequence registration_confirmation_seq" because `generate_confirmation_number()` is plpgsql WITHOUT `SECURITY DEFINER`, and a BEFORE INSERT trigger fires before the RLS `WITH CHECK` — so RLS never gets to mask it. Check `relkind='S'` alongside `relkind='r'` (#1533).
- `anonEntriesGrantContract` replays every migration to fold anon's effective grants, and its statement splitter hoists `EXECUTE '...'` payloads out of `DO $$` blocks to the END of the file. A version-guarded `REVOKE ... ON ALL TABLES IN SCHEMA public FROM anon` inside a `DO` block therefore reads as running last and wiping every column allowlist, even though live Postgres runs it in place. Keep blanket revokes as plain statements, ordered BEFORE the grants they precede (#1533).
- A `GRANT` can never narrow a broader `GRANT` an earlier migration already made — codifying an intended ACL that is tighter than the current one needs its own explicit `REVOKE`. Rebuilding from migrations and diffing is the only way to catch this; the migration text reads correct either way (`subscription_entitlement_grants` and `ringside_sessions`, #1533).
- "This branch matches a merged PR's `headRefName`" does NOT mean the branch is merged — it means a PR with that **name** merged. Commits pushed after the merge, or a re-created branch reusing a template name (`claude/vacation-myk9-<n>-a1`, `codex/nightly-qa-<date>`), leave the tip ahead of what actually landed. Compare the tip SHA against that PR's `headRefOid` before treating merged-PR as proof. This fired for real on 2026-08-03: the branch janitor deleted remote `codex/myk9-138-site-admin-clubs` as "provably merged" while it carried `b5c46c31f`, a commit never in `main` (PR #1555 merged at `72d706fa5`). Only the `git branch -D` deny saved the local copy. `scripts/reap-merged-branches.sh` now does the SHA check; the scheduled-task file still does not.
- Before re-`CREATE OR REPLACE`-ing a Postgres function, `grep -l "CREATE OR REPLACE FUNCTION public.<fn>" supabase/migrations/` and copy from the LATEST hit, never from the file whose name looks canonical — rebuilding `create_show_with_children` off `20260510143000` silently reverted `registry_id` (20260630120000) and the `person_id` judge-assignment shape (20260618120000), which typecheck and tests cannot catch (#1484).
- A **red** CI check is a verdict on the base it ran against, not on your diff — date it before believing it. Compare the PR's `baseRefOid` against `origin/main` and the check run's timestamp against the merges in between; a failing run that predates the commit fixing that exact failure is **stale**, so merge `origin/main`, push, and judge the re-run. The cheap tell is one PR failing a job another PR passes: the job is not broken, your base is old. On 2026-08-06 #1623's `E2E PR Smoke` was red from a run six commits stale, executed hours before #1624/#1626 made the missing single-role fixture secrets `optional` — the very cause of that failure — while the same job was green on #1627, cut after the fix. Costly in both directions: a stale red reads as evidence against a sound change, and it converts a mergeable PR into one parked awaiting a human.
- Same trap one layer down: a red `/admin/health` check is a verdict from whenever it last **ran**, not from now — read the check's own `checked_at` before concluding the fix is undeployed. Keys outside `CONTINUOUS_HEALTH_CHECK_KEYS` (`applied_acl_grants`, `anon_grants`) re-measure only on the `full` run at 03:00 ET / 07:00 UTC; the 5-minute `continuous-health-check` cron copies the previous verdict forward **verbatim**, so a fixed check keeps reporting a byte-identical stale `detail` and a frozen `checked_at` for up to 24h. On 2026-08-17 this presented as a merge-is-not-deploy gap for #1648 and was not one: `cron-health-check` v20 had shipped at 16:51 UTC, one minute after the merge, but the board was replaying the 07:00 UTC failure. Prove deployment by grepping the live bundle (`get_edge_function`), never by the deploy timestamp — the one-minute gap could have gone either way. The fix is a full run, not a redeploy, and only the user can force one (`run_system_health_check_now()` is gated on `is_site_admin()`; the MCP role gets `42501` calling even that gate) — so ask them to click "Run now". Redeploying instead would be a pointless shared-system write that leaves the board red and invites a false causal story.
- Auditing a view for a soft-delete (or any row) predicate with `pg_get_viewdef(...) ilike '%deleted_at is null%'` reports FALSE POSITIVES, and two of them stack. The pattern matches nested subqueries that decide who the _caller_ is rather than which row is returned, and `%e.deleted_at%` also matches any alias ENDING in `e` — `own_e.deleted_at`. `view_authenticated_entry_results` hit both at once and read as filtered while returning tombstones to 11 live call sites. Slice the view's own top-level `WHERE` first (`substring(lower(def) from E'\n  where .*$')` — pg_get_viewdef's pretty form indents it exactly two spaces) and anchor the alias (`~ '(^|[^a-z0-9_.])e\.deleted_at is null'`). Also check `security_invoker`: `false` means the view runs as its owner and RLS is never a backstop, so the view body is the only guard.
- `SELECT e.*` inside a view is frozen at creation but RE-EXPANDS on every rebuild, so adding one `WHERE` line can silently publish every column the base table gained since. `view_entry_with_results` (migration 094) froze at 70 columns while `entries` grew to 88 — a naive `DROP`+`CREATE` would have exposed `stripe_payment_intent_id`, `refund_amount`, `refund_notes`, `refund_decision` and 14 more to every authenticated caller. Replace the star with the explicit column list the live view already returns: it blocks the widening AND makes the output column set identical, so `CREATE OR REPLACE` works instead of `DROP` — which matters because `DROP` silently resets the view's ACL, and a `DROP` of a view others read needs `CASCADE` (four views read `view_stats_summary`). It does NOT save `security_invoker` — see the next line.
- `CREATE OR REPLACE VIEW` preserves a view's ACL but **RESETS its `reloptions`**: with no `WITH` clause the options are wiped and `security_invoker` falls back to its default of **false**, i.e. owner-run. Since these views are owned by a `BYPASSRLS` role and `authenticated` holds grants on them from `ALTER DEFAULT PRIVILEGES`, owner-run means no policy is consulted AND no base-column privilege is required — so on 2026-08-17 a migration that only added a `WHERE` line to three views handed every authenticated user `judge_notes`, `total_score`, `payment_status` and `entry_fee` for every entry platform-wide (20260817170000, reverted by 20260817190000). Two rules. Carry `WITH (security_invoker = ...)` INLINE on every `CREATE OR REPLACE VIEW`, or use `ALTER VIEW ... SET` when you only need the option. And verify `reloptions` after a push, not just the column list — an identical column set proves the statement succeeded, not that the view's metadata survived; the tell was that the one view rebuilt with an explicit `WITH` clause in the same push kept its setting while the three without lost theirs. Row-level tests cannot catch this (they run as owner or as an authorized caller and pass either way) — assert the metadata, folding NULL `reloptions` to false rather than skipping it.

- "Offline-first" in this repo covers DOMAIN data only — **permissions do not replicate.** `useRbacLifecycle` fetches roles over the network into React state that is never persisted (nothing writes `userRoles`/`effectivePermissions` to localStorage or IndexedDB), so a **cold** boot with no connectivity settles at `userRoles: []` and `ProtectedRoute` (`AuthContext.tsx:428`) renders `fallback` for every gated route — the user is authenticated (`getSession()` is a local read and works fine; this is authorization, not authentication) but authorized for nothing, with the entire show sitting in IndexedDB beneath them. The **warm** path is already correct and must NOT be "fixed": a failed refresh spreads `...previous`, preserving roles. That asymmetry is why the bug is invisible to every existing test — they all load online first, which is the only state in which it works. Generalize before adding any new gate: anything on the critical path to **rendering** — permissions, feature flags, remote config — must be as offline-capable as the data itself, or it quietly re-couples an offline-first app to the network (MYK9-200).

- A guard that is provably a **no-op over a whole dataset can wake up when you partition that dataset**, and every existing test passes either way. `summarizePaymentLedgerTotals` clamped `Math.max(0, gross - refunds)`; over the full ledger every refund row sits beside the charge it reverses, so `gross >= refunds` always held and the clamp was dead code — until `?year=` scoping split a 2026 refund from its 2025 charge and it reported "Net paid $0.00" for money that demonstrably came back. The same one-control change exposed two more of the same shape: a legacy full refund dated by the charge it reverses (`stripe_orders.refunded_at` existed but `useMyPayments` never selected it), and rows ordered by their parent order's `created_at` rather than each row's own date, so a 2026 refund of a 2024 charge sank below every 2026 transaction. All three were invisible while the list was one undifferentiated scroll, all three were caught by Codex and by nothing in CI. Before adding any filter, grouping, or scope to an existing list, grep the downstream math for clamps, `Math.max(0, ...)`, and "these always come in pairs" assumptions — partitioning re-arms every guard written when the set was whole (#1706).

- A test that greps the **source text** can only prove someone typed the thing; it cannot prove the thing does anything, so it will certify a no-op as a fix. `dropdownMenuOverflow.test.ts` asserts `collisionAvoidance={{ side: 'flip' }}` appears in `dropdown-menu.tsx` — but Base UI already defaults it (`collisionAvoidance.side || 'flip'`, identical in 1.6.0 and 1.7.0), so the asserted prop changed nothing. Worse, passing that object **replaces** `MenuPositioner`'s `DROPDOWN_COLLISION_AVOIDANCE = { fallbackAxisSide: 'none' }` wholesale, degrading it to `'end'` via `|| 'end'` and letting a tall menu jump to the horizontal axis instead of staying vertical and scrolling inside `--available-height` — the exact mechanism the MERGED half of MYK9-138 (#1555) depends on. The harm was in what the object **omitted**, which no source-grep can see. It survived two authors (`b5c46c31f`, `codex/dropdown-menu-flip`), a clean cherry-pick, 9 green tests, a passing non-vacuous mutation check, typecheck and lint; only reading `node_modules` caught it. Measured on `main` at 600px with 24px below the last row: the menu already flips to `side:top`, `--available-height` resolves to 520px, and it scrolls — the bug it "fixed" does not exist. Assert rendered geometry, not source strings; and when a fix's premise is "library X defaults to Y", read the installed package before believing it.

## Intent & Emotional Design

**Before making UX-facing changes, read [`docs/INTENT.md`](docs/INTENT.md).** It defines the emotional intent behind each role's experience. Every optimization, refactoring, or "improvement" to user-facing code should preserve the target feeling for that role. If code has an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

## Current development phase — consolidate, don't duplicate

The project is **pre-launch with no real users yet** for the monorepo myK9Show app. The old monorepo `apps/myk9q` app has been deleted after being absorbed into myK9Show `/at-show`; do not rebuild it. The current phase is focused on **simplifying and consolidating** — making a smooth, intuitive, logical workflow across the app. We are **not** in a phase of building new isolated features or adding more surface area.

This shapes every UX decision. Before proposing a new page, sheet, dialog, or affordance:

1. **Search for the existing surface first.** If a feature looks like it duplicates an existing page (e.g., "approve entries" exists on both the workbench _and_ the Entries Management page), that is a smell. Add a _link_ between the surfaces; do not reimplement.
2. **A fast path is not always new UI.** If the user needs a quicker way to do something that exists on page B, the answer is often a deep-link from page A to page B with filters pre-applied — not a re-implementation on page A.
3. **One concern, one page.** When in doubt about whether work belongs on page A or page B, ask. Don't guess by adding both. The workbench-collapse plan ([`docs/plan-show-map-workbench-collapse.md`](docs/plan-show-map-workbench-collapse.md)) is the precedent: it deleted Today + Wrap-up tabs not because they were wrong, but because their concerns belonged in fewer places.
4. **State the duplication question explicitly when proposing a feature.** Before building, answer: _"Does this duplicate an existing page? If so, why is duplication justified instead of a link?"_ If the answer is "yes, no strong justification," narrow scope before writing code.
5. **Deletions are a feature.** Removing a redundant surface is as valuable as adding a missing one — often more so at this phase. If you find yourself building something that overlaps an existing page, propose deleting the overlap.

The mental model: the user's experience is a single coherent workflow, not a menu of independent screens. Every new affordance either tightens that workflow or fragments it. Default to tightening.

## Development Principles

1. **Follow DRY principles** — Don't Repeat Yourself. Create reusable components if possible
2. **Follow SLC** — Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete)
3. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules
4. **Protect intent** — When code looks "wrong" but has an `// INTENT:` comment, it's deliberate (see "Intent & Emotional Design" above)

## Worktrees

Git worktrees share history but **not** gitignored files (`node_modules/`, `.env`, `dist/`). A `PostToolUse` hook runs `scripts/bootstrap-worktree.sh` automatically after `EnterWorktree`. If something is missing, run it manually:

```bash
bash scripts/bootstrap-worktree.sh   # installs deps, copies .env, builds packages
```

## Planning

Save plans to `docs/plan-<topic>.md`, never chat-only. Follow existing plans when they exist. **Every plan must include a testing phase** — a phase isn't complete until its tests pass. Directly under the `# Title`, add `> **Status:** Active` (`Active` / `Complete` / `Abandoned`) and register one row in [`docs/README.md`](docs/README.md); on merge, flip to `Complete`, `git mv` into `docs/archive/`, drop the index row. Full lifecycle rules: [`docs/README.md`](docs/README.md).

**OpenSpec carve-out.** When a single unit of buildable work goes through the opsx skills, the OpenSpec change (`openspec/changes/<id>/`) _is_ the plan — do not also author a `docs/plan-*.md` for the same work. When each format applies, and how to cross-link if both exist: [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 1.

## Commands

Package manager: **pnpm** (not npm). Root scripts (`dev:show`, `build`, `typecheck`, `lint`) are in `package.json`; `pnpm dev:show` serves myK9Show at http://localhost:5173. The non-obvious ones:

```bash
# Testing (run from app directories)
cd apps/myk9show && pnpm test     # myK9Show unit tests (vitest)
cd apps/myk9show && pnpm test:e2e # myK9Show E2E tests (playwright)

# Run a single test file
cd apps/myk9show && pnpm vitest run src/path/to/file.test.ts
# Run tests matching a name pattern
cd apps/myk9show && pnpm vitest run -t "pattern"
```

## Architecture Decisions

- **UI library (myK9Show):** Base UI via shadcn/ui — NOT Radix (Radix stagnated after WorkOS acquisition)
- **Deleted monorepo app:** `apps/myk9q` was removed after ringside functionality moved into myK9Show `/at-show` and shared packages
- **Database:** Unified Supabase project (`myk9-platform`)
- **Formatting:** Prettier auto-format hook runs on every file edit

## Database Configuration

- **Project ref:** `sojmvhhwsjxmfistvzbe`
- **Edge Functions:** Deploy with `--no-verify-jwt` (functions handle auth internally)
- **Migrations:** `supabase/migrations/` — numbered `NNN_description.sql`

- **Heritage / registry columns** (migrations 192–193): schema notes in [`docs/reference/heritage-registry-columns.md`](docs/reference/heritage-registry-columns.md) — always read via the `@/features/registries` helpers (`getShowLandingStyle`, `getTrialRegistry`, `getTrialTimezone`), never raw column access.

## Deployment

- **myK9Show staging:** myk9-platform-myk9show.vercel.app (auto-deploys from `main`)
- **Legacy production myK9Qv3:** myk9q.com (separate repo, untouched)

## Key Patterns

### Offline-first data

myK9Show and its shared ringside packages are offline-first where show-day reliability requires it. Always use replicated tables / replication-backed query functions for persistent app data that must work offline — never bypass with direct Supabase reads in core flows (breaks offline):

```typescript
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

### State Management

| Tool                  | Use For                                  | Examples                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| **Zustand**           | Client/UI state shared across components | Modals, filters, selections, domain stores |
| **React Query**       | Server state, async data fetching        | Lists, detail views, search results        |
| **React Context**     | Cross-cutting concerns (rarely changes)  | Auth/RBAC, theme, app-wide config          |
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, ringside scoring |
| **Local `useState`**  | Ephemeral, component-scoped state        | Form inputs, timers, dialog open/close     |

## Testing

Remove unused variables in tests rather than underscore-prefixing them — the prefix silences the lint rule without removing the dead binding.

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

Use the custom render from `src/test/utils/testUtils.tsx` instead of raw `render` — it wraps with QueryClient, Auth, and Router providers.

For bug-fixing methodology (assertion-first testing, seed-data/RBAC survey-first debugging, systematic-debugging vs. incident-triage) see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 3.

## Workflow

Set the corresponding Linear issue (team **MyK9-platform**) to In Progress when starting work on it, and keep it there throughout implementation and PR review. When implementation finishes, post a comment on the issue with:

- **What changed** — summary of the implementation
- **Tests/checks run** — what was executed and the result
- **Branch or PR link**
- **Risks or remaining work**
- **Whether the acceptance criteria passed**

Move the issue to Done only after the PR merges. Linear is the tracker of record; there are no sprint docs to reconcile (`OPEN-TODOS.md` / `TO-DOS.md` were retired by #1350). Two files still take entries, but only when the work leaves something the issue does not carry:

- [`docs/qa/findings.md`](docs/qa/findings.md) — a QA finding that outlived the task.
- [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) — standing debt that is deliberately _not_ a Linear task, i.e. reactive guidance rather than scheduled work. Static code-quality debt does not go here; it is measured by `pnpm qa:code-quality-ratchet`.

If neither applies, the Linear state change is the whole bookkeeping step.

**Which review to use, and the Codex second-opinion policy: see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 4.**

## Worktree & Merge Workflow — hard rules

Full mechanics: [`docs/reference/git-workflow.md`](docs/reference/git-workflow.md). The non-negotiable rules:

1. **Work in a worktree, never the primary checkout,** whenever concurrent agents may be active — `.githooks/pre-commit` enforces this. Bypass once with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...` only for the docs-only-direct-to-`main` flow.
2. **Never run `gh pr merge` from inside a feature worktree** — run it from the main repo directory.
3. **After a merge, verify the local branch survived** (`git branch --list <branch>`) before assuming `--delete-branch` cleaned it up.
4. **If the branch has a worktree, remove the worktree before deleting the branch** — git refuses `branch -D` on a branch any worktree still has checked out, including the current one, and including as the silent local-delete half of `gh pr merge --delete-branch`. Delete with `git branch -D <branch>` (not `-d`, squash rewrites SHAs).
5. **Worktree removal is always the final command of the cleanup sequence**, run from a path that still exists.
6. **Before a destructive history rewrite** (`reset --hard`, rebase drops, force-push), check for uncommitted edits in the working tree first — they get wiped, not carried.

## Database Migrations

- Before writing a migration that references existing rows (e.g., permissions), QUERY the target table first to confirm referenced values exist.
- Run migration commands from the worktree linked to Supabase, not the main repo.
- **Every `CREATE TABLE public.<name>` must include explicit `GRANT`s** to `anon` / `authenticated` / `service_role` as appropriate. As of Oct 30, 2026 Supabase no longer auto-exposes new `public` tables to the Data API (PostgREST / GraphQL / `supabase-js`); without a grant the table will silently 404 from the client. Template:

  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
  GRANT SELECT ON public.<table> TO anon;  -- only if anon should read
  REVOKE ALL ON public.<table> FROM anon;  -- REQUIRED if anon should have NO access
  ```

  Match the access level the table actually needs — never blanket-grant write to `anon`. Grants are orthogonal to RLS; both are still required.

- **Omitting a `GRANT` does NOT keep `anon` out — you must `REVOKE` explicitly.** This project carries `ALTER DEFAULT PRIVILEGES` in schema `public` granting `anon` full CRUD (`arwdDxtm`) on **every newly created table** (verified via `pg_default_acl`; grantors are both `postgres` and `supabase_admin`). Those default privileges take precedence over the Oct 30 change above, so a table meant to exclude `anon` gets full anon CRUD unless the migration says otherwise. Discovered 2026-07-25 on `dog_favorites`, which shipped with anon holding full privileges despite deliberately granting it none (migration `20260725130000` fixed it; RLS had masked the gap because every policy was `TO authenticated`). Wider audit: MYK9-93.

- **Verify grants against the applied database, not the migration text.** A correct migration file does not prove a correct ACL — the file above passed review and still produced anon CRUD. After `db push`:

  ```sql
  select unnest(relacl)::text from pg_class where oid = 'public.<table>'::regclass;
  ```

  Table-level ACLs are only half the picture — check column-level grants too. A broad `REVOKE ALL ON ALL TABLES ... FROM anon` silently drops them, `pg_class.relacl` will not show it, and a `select=*` PostgREST probe returns 200 either way so it cannot see the difference (MYK9-93 briefly exposed `entries.total_score` / `payment_status` / `stripe_payment_intent_id` to anon on staging this way):

  ```sql
  select a.attname, unnest(a.attacl)::text
  from pg_attribute a
  where a.attrelid = 'public.<table>'::regclass and a.attacl is not null;
  ```

  Do **not** use `information_schema.role_table_grants` for this: it only shows grants visible to the querying role and returns empty over the MCP connection, so it cannot prove absence.

## Auto Mode — shared-system writes

Auto Mode's "execute immediately" guidance does NOT extend to shared-system mutations. Confirm before each of these even when the initial request implied consent — adding rows to a shared DB counts, "not destructive" is not the test:

- `supabase db push` on a linked project (writes to staging/prod DB)
- `supabase functions deploy`
- `git push --force` to any branch, or any push to `main` when on a feature branch
- Creating/closing PRs, issues, or comments on GitHub
- Posting to Slack, email, or any external service

One up-front confirmation covers a sequence of related pushes in the same session; re-confirm when switching to a new system or operation type.

**Exception — docs-only changes may go direct to `main`.** When a commit touches _only_ documentation files, skip the PR ceremony: commit on `main` (or fast-forward a feature commit into `main`) and push directly. No confirmation needed beyond the user's request to commit/push. `CLAUDE.md` and `.claude/**`/`.github/**` are always out of scope for this exception — they need a PR regardless of how small the change. Full in-scope/out-of-scope file list and the bypass mechanism: [`docs/reference/git-workflow.md`](docs/reference/git-workflow.md) § "Docs-only direct-to-`main`." Verify the commit's filelist matches the scope before pushing.
