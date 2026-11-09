# CLAUDE.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

<!-- shared-rules:begin -->

## Shared rules

This block is the one rulebook for Claude Code and Codex. Edit it HERE (`docs/agents/shared-rules.md`), then run `pnpm qa:shared-rules:write`; CI fails if `CLAUDE.md` or `AGENTS.md` drifts from it. Harness-specific material lives outside the markers in each file.

It is the always-loaded summary. The full text is equally binding and lives where the work happens: `docs/agents/rules-reference.md`, and the `db-push`, `deploy`, `playwright-cli`, `commit` and `ship-pr` skills, which also carry the lessons for their kind of work. Read the named one before starting that work.

## Product Goal

Default long-term goal: make myK9 launch-ready for fall 2026, with secretary/show-day reliability as the highest priority. Use `docs/goals/fall-2026-launch-readiness.md` as the prioritization frame when choosing and executing backlog work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Current development phase — consolidate, don't duplicate

Pre-launch, **no real users yet**. The old `apps/myk9q` app was absorbed into myK9Show `/at-show` and deleted; do not rebuild it. This phase **simplifies and consolidates** one coherent workflow; it does not add surface area. Before proposing a page, sheet, dialog or affordance:

1. **Search for the existing surface first.** A duplicate is a smell: link the surfaces, do not reimplement.
2. **A fast path is often a deep-link** with filters pre-applied, not new UI.
3. **One concern, one page.** Unsure which page owns it? Ask; never add both.
4. **State the duplication question before building:** _"Does this duplicate an existing page? If so, why is duplication justified instead of a link?"_ No strong justification: narrow the scope.
5. **Deletions are a feature.** Propose deleting an overlap instead of building into it.

## Intent & Emotional Design

**Before making UX-facing changes, read `docs/INTENT.md`.** Every optimization, refactoring, or "improvement" to user-facing code should preserve the target feeling for that role. If code has an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

## Development Principles

1. **Don't guess or assume** — Verify facts, check actual code, ask if uncertain
2. **Follow DRY** — create reusable components where possible
3. **Follow SLC** — Simple (no feature bloat), Lovable (UX polish, error states, delight), Complete (end-to-end, zero placeholders or TODOs)
4. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules. Only `pnpm qa:code-quality-ratchet` measures this.
5. **Evidence over confidence** — Compilation is necessary but not sufficient. Before declaring work complete, verify the real artifact and relevant user-visible side effects. Trace bugs to their root cause. For non-trivial work, establish the data shape first, sequence changes into independently verifiable units, and prefer reusable tests or scripts for checks that will recur.

## Commands

Package manager: **pnpm** (never `npm` or `npx`). Root scripts (`dev:show`, `build`, `typecheck`, `lint`) are in `package.json`; `pnpm dev:show` serves myK9Show at http://localhost:5173. Tests run from `apps/myk9show`: `pnpm test` (vitest; runs `qa:dist-fresh` first), `pnpm test:e2e` (playwright), `pnpm vitest run <files>` or `-t "pattern"` for a targeted run.

Redirect check output to a file and echo the real exit status, because a pipe through `tail`/`grep` reports the filter's exit code: `pnpm test > .logs/suite.log 2>&1; echo "EXIT=$?"`. `.logs/` at the worktree root is gitignored and per-worktree; never log to `/tmp/<name>.log`, which every session on this Mac shares.

## Architecture Decisions

- **UI library (myK9Show):** Base UI via shadcn/ui — NOT Radix (Radix stagnated after WorkOS acquisition)
- **Database:** Unified Supabase project (`myk9-platform`)
- **Refunds are never automatic; they require human approval.** Code that finds money it cannot honor queues a `refund_requests` row and alerts; only a person's action (a refund dialog, or the admin approval in `stripe-approve-refund`) may call `refunds.create`.
- **Formatting:** Prettier (`.prettierrc` at the root). Both harnesses format on edit through a hook, and CI runs `pnpm format:check:changed`.

## Database Configuration

- **Project ref:** `sojmvhhwsjxmfistvzbe`
- **Edge Functions:** Deploy with `--no-verify-jwt` (functions handle auth internally)
- **Migrations:** `supabase/migrations/` — versioned `YYYYMMDDHHMMSS_description.sql` (14-digit UTC timestamp). The `NNN_` files are the pre-2026 convention; read them, never extend them.
- **Heritage / registry columns** (migrations 192–195): always read via the `@/features/registries` helpers (`getShowStyle`, `getTrialRegistry`, `getTrialTimezone`), never raw column access.

## Deployment

- **Nothing deploys on merge.** Production (myk9show.com) moves only when someone runs the **Deploy myK9Show** workflow (`gh workflow run deploy-myk9show.yml`), which builds the newest `main` commit with green CI. Running it is a shared-system write: only when the user asks, or under standing approvals. `main` routinely runs ahead of production. **Cadence:** at set points in the day and on demand before the owner tests, not after each merge.
- **Dormant until MYK9-44:** `deploy-staging.yml` / `deploy-production.yml`. Do not reason from them, fix them, or gate on them.
- **Vercel Hobby quota:** 100 deployments a day, shared. No project builds from Git; guides publish only via `gh workflow run deploy-guides.yml`. A deploy failing with `api-deployments-free-per-day` is the quota, not the code. Batch local fixes before pushing. A Vercel preview context never blocks a PR (say which check you ignored). Confirm with the user before changing Vercel project settings.
- **Legacy production myK9Qv3:** myk9q.com (separate repo, untouched).

## Key Patterns

**Offline-first data.** myK9Show and its shared ringside packages are offline-first where show-day reliability requires it. Persistent app data that must work offline goes through replicated tables / replication-backed query functions (`@myk9/replication`); never bypass with direct Supabase reads in core flows. Direct PostgREST is acceptable only for explicitly online-only or auth-adjacent paths (user/auth queries, RPCs, checkout/promo flows, out-of-scope admin utilities). Mutations use the established mutation manager / replication workflow for the area.

**State management.** Zustand for client/UI state shared across components; React Query for server state; React Context for rarely changing cross-cutting concerns (auth, theme); `@myk9/replication` for persistent data that must work offline; local `useState` for ephemeral component state.

## Testing

- Test code compiles cleanly: no `await` outside `async`, no unused variables (remove them, never underscore-prefix). Run the relevant suite before calling work complete.
- A test runner that hangs for more than 30 seconds: stop and report, never retry in a loop.
- Use the custom render from `src/test/utils/testUtils.tsx`, not raw `render`.
- **Assertion-first for value-sensitive bugs.** When a specific value goes to a specific place, write the `expect(...).toHaveBeenCalledWith(...)` line first and run it red before touching the implementation.
- **Shuffled runs.** CI shuffles, local runs do not. Before pushing a test you added or touched, run the whole app suite with `pnpm vitest run --sequence.shuffle` (never `pnpm test --sequence.shuffle`): once, or six or more times when the change adds module-scope mutable state.
- App tests import every package's built `dist`; after editing a package, rebuild it (`pnpm --filter @myk9/<pkg> build`) or `pnpm qa:dist-fresh` fails. Behavioral SQL tests under `supabase/tests/` run only in CI, so registering one is not having run it.

## Workflow

Linear (workspace `myk9-platform`, team **MyK9-platform**, prefix `MYK9-*`) is the tracker of record; rules in `docs/agents/issue-tracker.md`. Every new issue gets a priority at creation (`1` Urgent to `4` Low by launch relevance, default `3`).

### Gates, in order

1. **Before starting** work that will produce a PR: `pnpm qa:inflight` (exit 1 = an open PR, worktree or recent branch touches these paths; exit 2 = could not decide, not a pass), then Linear issues **In Progress** naming the paths and (Claude Code) `list_sessions`. Set the issue In Progress through review and post one claim comment (format in the rules reference); one claim per worktree. **Batch by surface:** open issues naming the same page, sheet or flow share one branch, PR and deploy, each claimed and closed on its own; money work and anything adding a migration never joins a batch.
2. **Before pushing**: the `/commit` validation ladder, and `pnpm qa:code-quality-ratchet` when the change adds lines to an existing file.
3. **Before merging**: `pnpm qa:review-tier --base origin/main` reports the review floor (`none`, `adversarial`, `independent`, or optional review); rules in `scripts/qa/review-tier.ts` and `docs/PLAYBOOK.md` § 4. `scripts/qa/post-review-gate.sh` is the only writer of a `Review gate:` line. **`independent`** requires the OTHER harness (`pnpm qa:codex-review` for Claude-authored work; same-harness never suffices), and the verdict is pinned to the head SHA, so a later push needs a fresh review. **Convergence:** stop and restructure at the SECOND finding on the same path across rounds, when findings describe code the PREVIOUS fix introduced, or at a second bug fix on the same file or flow within seven days; ask whether to delete the feature first, and post the restructure proposal instead of another patch. **Filing:** a finding becomes a Linear issue only if a real user could plausibly hit it before launch and it causes real harm (wrong or lost data, money, blocked show-day work, a privacy or security exposure); anything else is one line on the PR. Overrides, lenses and the docs-only two-round budget: `ship-pr`.
4. **Before calling checks green**: `bash scripts/qa/watch-pr-checks.sh <pr>` (0 green · 1 a REQUIRED check failed · 2 head moved · 3 timeout, NOT a verdict · 5 required green but a non-required check failed · 6 PR conflicts with its base, merge the base in). Never eyeball `statusCheckRollup`; the watcher names only the FIRST required failure, so read the whole rollup before diagnosing.
5. **After merge**: a merge is not a deploy. Migrations need `supabase db push`, edge functions `supabase functions deploy` (the `deploy` skill), the frontend the next Deploy myK9Show run. Merged work awaiting acceptance evidence is In Review; unmerged work stays In Progress. Done requires a fresh full-issue read and every criterion met.

### Reading the board

Closed issues auto-archive and a default `list_issues` hides them: pass `includeArchived: true` on any "has this been filed, fixed, or rejected?" query, or an empty result means only "not open". Prefer `get_issue` by id, and never move an issue to Done from a `list_issues` result (it truncates descriptions).

### Doing the work

- **Before editing:** read the Linear issue, its plan and the existing code; name the acceptance criteria and non-goals; check `git status` and preserve unrelated work. For show-day, persistent-data or authorization work, verify the established replication and RBAC paths first.
- **While editing:** only the acceptance criteria, in the existing conventions; tests for changed logic, data flow, permissions, integrations or user-visible behavior.
- **Before a PR:** the narrowest useful verification and a diff read for unrelated changes; body per `.github/pull_request_template.md`.
- **After:** comment on the Linear issue with what changed, checks and results, branch or PR, risks, and whether the criteria passed.
- **Reviewing a PR:** against the acceptance criteria; findings grouped must fix before merge / should fix soon / safe to merge.

## Worktree & Merge Workflow — hard rules

Mechanics: `docs/reference/git-workflow.md`.

1. **Work in a worktree, never the primary checkout** (`.githooks/pre-commit` enforces it; `MYK9_ALLOW_PRIMARY_COMMIT=1` only for the docs-only-direct-to-`main` flow). Worktrees do not share gitignored files: `bash scripts/bootstrap-worktree.sh`.
2. **Never run `gh pr merge` from inside a feature worktree**; run it from the main repo directory.
3. **Merge with `gh pr merge --squash`, never `--delete-branch`.**
4. **Leave the local branch.** Claude Code cannot delete it; Codex may, only after `git rev-parse <branch>` equals the merged PR's `headRefOid`.
5. **Worktree removal is the final command of cleanup**, run from a path that still exists.
6. **Before a destructive history rewrite** (`reset --hard`, rebase drops, force-push), check for uncommitted edits; they get wiped.
7. **Own a merge through completion:** re-check against current `main`, verify, and monitor until it merges or hits a real blocker. A red check whose run predates the `main` fix: merge `origin/main` in and push, which is a new head, so the review gate runs again. Stop for the user only on a failure that is unrelated, risky to fix, or a product decision.

## Database Migrations

Load the `db-push` skill before writing or pushing a migration; it carries these rules in full and the SQL lessons.

- Query the target table before a migration that references existing rows. Run migration commands from the worktree linked to Supabase.
- Pick the timestamp against `origin/main` AND the linked database, at a specific odd time such as `174500`; never `supabase db push` from an unmerged branch.
- **Every `CREATE TABLE public.<name>` carries explicit `GRANT`s, and an explicit `REVOKE ALL ... FROM anon` when anon gets no access.** Default privileges here grant `anon` full CRUD on every new table, so omitting a `GRANT` does not keep `anon` out. Grants are orthogonal to RLS; both are required.
- Verify grants against the applied database (`pg_class.relacl` and column-level `pg_attribute.attacl`), never the migration text or `information_schema.role_table_grants`.

## Auto Mode — shared-system writes

"Execute immediately" does NOT extend to shared-system mutations. Confirm before each, even when the request implied consent ("not destructive" is not the test). `.githooks/pre-push` enforces `PUSH HOLD` directives; verify `core.hooksPath` in every checkout.

- `supabase db push` on a linked project, and `supabase functions deploy`
- `git push --force` to any branch, or any push to `main` from a feature branch
- Creating/closing PRs, issues, or comments on GitHub
- Posting to Slack, email, or any external service

One confirmation covers related pushes in a session; re-confirm for a new system or operation type. "Ship this", "create a PR" or `/ship-pr` authorizes the push, the PR and the review-gate comment for that branch; merging needs its own authorization unless the request said to ship through completion or standing approvals cover it.

- **Standing approvals (pre-launch):** while `docs/agents/standing-approvals.md` says `status: ACTIVE` (read it fresh each time) and the tripwire exits 0 right before the action (`pnpm qa:prelaunch-tripwire --merge` for a merge, plain for Deploy myK9Show), merging a green PR and running Deploy myK9Show need no confirmation. `supabase db push` and `supabase functions deploy` always do. What needs the owner goes to Linear (`needs:decision` / `needs:operator`), not a chat question.
- **Linear updates are pre-authorized:** create issues, change status, labels or description, and comment, without asking. Owner decisions are recorded, never made. Deletions, team settings, saved views and label definitions still need confirmation.
- **Docs-only changes may go direct to `main`** with no confirmation beyond the request to commit/push. Never in scope (always a PR): `CLAUDE.md`, `AGENTS.md`, `docs/agents/shared-rules.md`, `docs/agents/rules-reference.md`, `.claude/**`, `.codex/**`, `.agents/**`, `.github/**`. Scope and bypass: `docs/reference/git-workflow.md`; verify the commit's filelist first.

## Debugging seed-data / config bugs

Survey every related table in one query pass before writing a migration or code fix (role, permission/config and join/link tables). The full recipe, when to collapse the systematic-debugging ceremony, and when `incident-triage` applies instead, is `docs/PLAYBOOK.md` § 3.

## Planning

Save plans to `docs/plan-<topic>.md`, never chat-only, and follow existing plans. **Every plan includes a testing phase.** Under the `# Title` add `> **Status:** Active` (`Active` / `Complete` / `Abandoned`) and register one row in `docs/README.md`; on merge flip to `Complete`, `git mv` into `docs/archive/`, drop the row. Work that goes through the opsx skills uses its OpenSpec change (`openspec/changes/<id>/`) as the plan; do not also write a `docs/plan-*.md`.

## Browser automation session ownership

Each task owns a unique Playwright CLI session; never the default, a generic name, or another task's. Scripted work: `pnpm qa:browser-session sh path/to/browser-work.sh`. Interactive work: pass `-s=<unique name>` on every command and close that exact session before finishing. Never `close-all`, `kill-all`, blanket Chrome termination, or profile deletion. Full rules: the `playwright-cli` skill.

<!-- shared-rules:end -->

## Agent skills

### Issue tracker

Linear (workspace `myk9-platform`, issue prefix `MYK9-*`). See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`, extended with `docs/INTENT.md` for UX-facing work. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Worktrees (Claude Code)

A `PostToolUse` hook runs `scripts/bootstrap-worktree.sh` automatically after `EnterWorktree`. If something is missing (`node_modules/`, `.env`, `dist/`), run it manually:

```bash
bash scripts/bootstrap-worktree.sh   # installs deps, copies .env, builds packages, activates git hooks
```

## Self Learning

When I correct you or you catch yourself making a mistake, before continuing, add the lesson as a one-line rule under LESSONS so it never happens again. Its narrative section in `docs/lessons/README.md` carries one `**Guard:**` line: the program that catches the trap, a filed `MYK9-<n>` issue to build that check, or `human-only: <why>`; `lessonGuards.test.ts` fails without it.

A LESSON may be **retired** once the trap is structurally impossible — a guard, test, lint rule, or type now catches it, or the code path no longer exists. Delete the line and cite the PR that made it unreachable in the commit message. LESSONS is for traps only a human could have known about; anything a check already enforces is noise.

## LESSONS

One to three lines per lesson: the rule, the mechanism, and a pointer to the incident in [`docs/lessons/README.md`](docs/lessons/README.md). A lesson whose trap is now caught by a program is a one-line pointer at that program. `apps/myk9show/src/test/ci/instructionFileBudget.test.ts` enforces the shape and the word ceilings; the budget and retirement rules are [`docs/lessons/README.md`](docs/lessons/README.md) § Budget.

Domain lessons load with the skill that does the work: SQL and migrations in `db-push`, deploys in `deploy`, tests and commits in `commit`, browser walks in `playwright-cli`, review and merge in `ship-pr` (each skill's `## Lessons`). The lessons below apply everywhere.

- **No Docker here.** Use the configured Supabase/staging workflows for database and browser verification. (docs/lessons/README.md#no-docker)
- **`git update-ref -d` and `git checkout -- <path>` are denied here too** (beside `git branch -D`, Worktree rule 4); in an unattended run that is a silent stall. Discard with `git restore`. (docs/lessons/README.md#git-branch-delete-denied)
- **If a background-task chip's work gets absorbed into the current session, dismiss the chip immediately**, or the user may start it and duplicate the work. (docs/lessons/README.md#dismiss-absorbed-chip)
- **Offline-first covers domain data; identity and permissions must be as offline-durable as the data**, or a cold offline boot holds `hasRole(JUDGE)` with `personId === undefined` and every hook keyed on `databaseUserId` reports "no rows" as fact. Treat unresolved identity as its own state, and when you make one half of a coupled pair offline-durable, ask what still is not. (docs/lessons/README.md#offline-identity-pairing)
- **Partitioning a dataset re-arms every guard written when the set was whole.** Before adding a filter, grouping or scope to an existing list, grep the downstream math for clamps, `Math.max(0, …)` and "these always come in pairs" assumptions. (docs/lessons/README.md#partition-rearms-guards)
- **When a test asserts the opposite of the fix you are about to make, `git log -S` the assertion string**, not `git blame` the implementation line; blame lands on the last refactor, `-S` finds the commit that chose it. Treat "I had to rewrite a test to make this work" as a stop sign, and grep the action catalog before concluding a capability has no path. (docs/lessons/README.md#git-log-s-assertion)
- **`tsc --noEmit -p tsconfig.json` typechecks nothing in `apps/myk9show` and exits 0** (solution-style, `"files": []`). Use `pnpm typecheck` for the gate and `pnpm --filter @myk9/show typecheck:app` (incremental) for a fast scoped check; when a check is suspiciously fast and silent, verify it fails on a deliberate error. (docs/lessons/README.md#tsc-solution-tsconfig)
- **A fix that adds a discriminator creates new branches, and the original bug can survive inside one of them.** Re-read the original complaint against each new branch, and never discriminate on a net money figure: it is zero in two different worlds. (docs/lessons/README.md#discriminator-branches)
- **An anchored text edit written from the text you WROTE misses after the formatter runs**, and a chained script then carries on past the miss. Re-read the file after any format step before anchoring, or anchor on structure with a regex, and make chained scripts stop at the first failed step. (docs/lessons/README.md#anchored-edit-after-format)
- **A guard that splits a command on whitespace is off for every path with a space in it, which is this repo's own path.** Tokenize quote-aware, match on subcommand plus flag set, and replay the guard's verdict against known-answer fixtures on every change. (docs/lessons/README.md#guard-word-split)
- **In zsh, `read path` (or any assignment to `path`, `PATH`, `cdpath`, `fpath`, `manpath`) silently replaces the command search path**, because `path` is tied to `PATH`: a `while read -r path` loop fails every command after its first iteration, prints empty fields and exits 0. Name loop variables anything else (`wtdir`, `p`); bash is unaffected. (docs/lessons/README.md#zsh-read-path)
- **A forked audit session that meets housekeeping noise should file it, not fix it** — `pnpm qa:inflight` (Gates step 1) only sees paths, not the urge to fix what you tripped over. (docs/lessons/README.md#inflight-check)
- **A script's `set` line is not the whole option set — establish the invoking shell's flags before calling a guard fail-open.** A GitHub Actions `run:` step is `bash -e {0}`, so `errexit` is already on and `set -uo pipefail` cannot clear it. For any "this guard does not fire" finding, run the known-answer fixture in both directions BEFORE filing, never as its closure contract. (docs/lessons/README.md#shell-option-set)
- **While standing approvals are ACTIVE, never ask permission in chat for a pre-approved merge or Deploy myK9Show**: run the tripwire and act, or do not do it. Asking voids the run as unattended evidence and is the interruption the approvals removed. A question about whether the work is wanted is still fine. (docs/lessons/README.md#standing-approvals-dont-ask)
