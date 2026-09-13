# CLAUDE.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

<!-- shared-rules:begin -->

## Shared rules

This block is the one rulebook for Claude Code and Codex. Edit it HERE (`docs/agents/shared-rules.md`), then run `pnpm qa:shared-rules:write`; CI fails if `CLAUDE.md` or `AGENTS.md` drifts from it. Harness-specific material (Claude Code's LESSONS and skills index, Codex's OPSX routing and maintenance flow) lives outside the markers in each file.

## Product Goal

Default long-term goal: make myK9 launch-ready for fall 2026, with secretary/show-day reliability as the highest priority. Use [`docs/goals/fall-2026-launch-readiness.md`](docs/goals/fall-2026-launch-readiness.md) as the prioritization frame when choosing and executing backlog work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Current development phase — consolidate, don't duplicate

The project is **pre-launch with no real users yet** for the monorepo myK9Show app. The old monorepo `apps/myk9q` app has been deleted after being absorbed into myK9Show `/at-show`; do not rebuild it. The current phase is focused on **simplifying and consolidating** — making a smooth, intuitive, logical workflow across the app. We are **not** in a phase of building new isolated features or adding more surface area.

This shapes every UX decision. Before proposing a new page, sheet, dialog, or affordance:

1. **Search for the existing surface first.** If a feature looks like it duplicates an existing page (e.g., "approve entries" exists on both the workbench _and_ the Entries Management page), that is a smell. Add a _link_ between the surfaces; do not reimplement.
2. **A fast path is not always new UI.** If the user needs a quicker way to do something that exists on page B, the answer is often a deep-link from page A to page B with filters pre-applied — not a re-implementation on page A.
3. **One concern, one page.** When in doubt about whether work belongs on page A or page B, ask. Don't guess by adding both. The workbench-collapse plan ([`docs/plan-show-map-workbench-collapse.md`](docs/plan-show-map-workbench-collapse.md)) is the precedent: it deleted Today + Wrap-up tabs not because they were wrong, but because their concerns belonged in fewer places.
4. **State the duplication question explicitly when proposing a feature.** Before building, answer: _"Does this duplicate an existing page? If so, why is duplication justified instead of a link?"_ If the answer is "yes, no strong justification," narrow scope before writing code.
5. **Deletions are a feature.** Removing a redundant surface is as valuable as adding a missing one — often more so at this phase. If you find yourself building something that overlaps an existing page, propose deleting the overlap.

The mental model: the user's experience is a single coherent workflow, not a menu of independent screens. Every new affordance either tightens that workflow or fragments it. Default to tightening.

## Intent & Emotional Design

**Before making UX-facing changes, read [`docs/INTENT.md`](docs/INTENT.md).** It defines the emotional intent behind each role's experience. Every optimization, refactoring, or "improvement" to user-facing code should preserve the target feeling for that role. If code has an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

## Development Principles

1. **Don't guess or assume** — Verify facts, check actual code, ask if uncertain
2. **Follow DRY principles** — Don't Repeat Yourself. Create reusable components if possible
3. **Follow SLC** — Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete)
4. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules. CI's `pnpm qa:code-quality-ratchet` fails any regression against the committed baseline, and nothing in typecheck, lint, or the test suite approximates it; run it from the worktree before pushing a change that adds lines to an existing file.
5. **Protect intent** — When code looks "wrong" but has an `// INTENT:` comment, it's deliberate (see "Intent & Emotional Design" above)
6. **Evidence over confidence** — Compilation is necessary but not sufficient. Before declaring work complete, verify the real artifact and relevant user-visible side effects. Trace bugs to their root cause. For non-trivial work, establish the data shape first, sequence changes into independently verifiable units, and prefer reusable tests or scripts for checks that will recur.

## Commands

Package manager: **pnpm** (never `npm` or `npx`). Root scripts (`dev:show`, `build`, `typecheck`, `lint`) are in `package.json`; `pnpm dev:show` serves myK9Show at http://localhost:5173. The non-obvious ones:

```bash
# Testing (run from app directories)
cd apps/myk9show && pnpm test     # myK9Show unit tests (vitest); runs qa:dist-fresh first
cd apps/myk9show && pnpm test:e2e # myK9Show E2E tests (playwright)

# Run one targeted test file
cd apps/myk9show && pnpm vitest run src/path/to/file.test.ts
# Run multiple targeted test files
cd apps/myk9show && pnpm vitest run src/path/to/first.test.ts src/path/to/second.test.ts
# Run tests matching a name pattern
cd apps/myk9show && pnpm vitest run -t "pattern"
```

Redirect check output to a file and echo the real exit status — a pipe through `tail`/`grep` reports the filter's exit code, not the runner's: `pnpm test > .logs/suite.log 2>&1; echo "EXIT=$?"`. `.logs/` at the worktree root is gitignored and per-worktree, so two sessions never share a log file.

## Architecture Decisions

- **UI library (myK9Show):** Base UI via shadcn/ui — NOT Radix (Radix stagnated after WorkOS acquisition)
- **Deleted monorepo app:** `apps/myk9q` was removed after ringside functionality moved into myK9Show `/at-show` and shared packages
- **Database:** Unified Supabase project (`myk9-platform`)
- **Formatting:** Prettier (`.prettierrc` at the root). Claude Code formats on every file edit through a hook; Codex's PostToolUse hook runs `scripts/qa/format-changed.sh` after every tool call; CI's Quality Checks runs `pnpm format:check:changed` on the files changed since the merge base (#2121). `.astro` files and one runbook are deliberately ignored, with the reason in `.prettierignore`.

## Database Configuration

- **Project ref:** `sojmvhhwsjxmfistvzbe`
- **Edge Functions:** Deploy with `--no-verify-jwt` (functions handle auth internally)
- **Migrations:** `supabase/migrations/` — versioned `YYYYMMDDHHMMSS_description.sql` (14-digit UTC timestamp). The `NNN_` files are the pre-2026 convention; read them, never extend them. Picking a version: see § Database Migrations below.
- **Heritage / registry columns** (migrations 192–195): schema notes in [`docs/reference/heritage-registry-columns.md`](docs/reference/heritage-registry-columns.md) — always read via the `@/features/registries` helpers (`getShowStyle`, `getTrialRegistry`, `getTrialTimezone`), never raw column access.

## Deployment

- **What ships today:** Vercel builds every push to `main` and serves it at myk9-platform-myk9show.vercel.app and the public domain. That build starts before CI finishes and is not gated by it. A Vercel build-rate-limit failure on `main` leaves the previous bundle live (LESSONS `vercel-rate-limit`).
- **Dormant until MYK9-44:** the CI-gated path in `deploy-staging.yml` / `deploy-production.yml`. `STAGING_RELEASE_ENABLED` is unset, so every run is skipped and the `staging-release` / `guides-release` refs are frozen at `5975adadb` (2026-07-27), 700+ commits behind `main`. Do not reason from it, fix it, or gate on it until that issue is In Progress; it is sequenced with the Stripe live cutover (MYK9-11). Runbook: `docs/operations/ci-vercel-deploys.md`.
- **Legacy production myK9Qv3:** myk9q.com (separate repo, untouched)

### Vercel Hobby quota / preview deploy discipline

This repo has multiple Vercel projects on a Hobby account, so PR preview deployments can hit the daily deployment-created limit. Follow [`docs/operations/vercel-preview-quota.md`](docs/operations/vercel-preview-quota.md) for the full runbook.

- Before pushing a PR branch, batch local fixes and run the relevant local checks/review first; avoid micro-pushes that only exercise Vercel again.
- Vercel preview contexts are intentionally not required by the GitHub `main-required-checks` ruleset. A red `Vercel – …` context whose `targetUrl` ends `?upgradeToPro=build-rate-limit` is an account quota, not a verdict on the diff; if the required checks are green, treat it as non-blocking unless the preview itself is needed for visual QA, and say which check you ignored.
- Before changing Vercel project settings, confirm the shared-system mutation with the user. The desired Vercel setting is monorepo skip-unaffected projects, not an Ignored Build Step workaround.

## Key Patterns

### Offline-first data

myK9Show and its shared ringside packages are offline-first where show-day reliability requires it. Always use replicated tables / replication-backed query functions for persistent app data that must work offline — never bypass with direct Supabase reads in core flows (breaks offline):

```typescript
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

For myK9Show, core reads should go through the replication-backed query/table layer. Direct PostgREST remains acceptable only for explicitly online-only or auth-adjacent paths documented in the migration design (for example user/auth queries, RPCs, checkout/promo flows, or other out-of-scope admin utilities). Mutations should use the established mutation manager / replication workflow for the area being changed.

### State Management

| Tool                  | Use For                                  | Examples                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| **Zustand**           | Client/UI state shared across components | Modals, filters, selections, domain stores |
| **React Query**       | Server state, async data fetching        | Lists, detail views, search results        |
| **React Context**     | Cross-cutting concerns (rarely changes)  | Auth/RBAC, theme, app-wide config          |
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, ringside scoring |
| **Local `useState`**  | Ephemeral, component-scoped state        | Form inputs, timers, dialog open/close     |

## Testing

Always ensure generated test code compiles cleanly: no `await` outside `async`, no unused variables (remove them rather than underscore-prefixing — the prefix silences the lint rule without removing the dead binding), and run the relevant suite before considering work complete.

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: the test suite has pre-existing timeout/hanging problems.

Use the custom render from `src/test/utils/testUtils.tsx` instead of raw `render` — it wraps with QueryClient, Auth, and Router providers.

**Assertion-first for value-sensitive bugs.** When a bug involves a specific value going to a specific place (enum string to a DB column, key in a response object, header in an HTTP call), write the `expect(...).toHaveBeenCalledWith(...)` line first and run it red before touching the implementation. A failing test proves the current wrong value; the fix then flips it green. This catches silent overwrites that visual inspection and typechecking miss.

**Shuffled runs.** CI runs vitest with `--sequence.shuffle`; local runs do not. Run the whole app suite shuffled (`pnpm vitest run --sequence.shuffle`, never `pnpm test --sequence.shuffle`, which pnpm swallows) before pushing any test you added or touched — once when the change adds no module-scope mutable state, six or more times when it does. The `/commit` skill carries the arithmetic.

App tests import every package's built `dist`; after editing a package, rebuild it (`pnpm --filter @myk9/<pkg> build`) or `pnpm qa:dist-fresh` will fail. Behavioral SQL tests under `supabase/tests/` run only in CI (no container runtime on the development Mac), so registering one is not the same as having run it.

For bug-fixing methodology (assertion-first testing, seed-data/RBAC survey-first debugging, systematic-debugging vs. incident-triage) see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 3.

## Workflow

Linear (workspace `myk9-platform`, team **MyK9-platform**, issue prefix `MYK9-*`) is the tracker of record; there are no sprint docs to reconcile (`OPEN-TODOS.md` / `TO-DOS.md` were retired by #1350). Full querying rules: [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Gates, in order

1. **Before starting** work that will produce a PR: `pnpm qa:inflight` (exit 1 = an open PR, another worktree, or a recent unmerged branch already touches these paths; local branches older than 3 days are inventory-only, counted in the summary, and expandable with `--verbose`; exit 2 = could not decide, not a pass), then the two checks a shell cannot make: Linear issues **In Progress** naming the paths, and (Claude Code) `list_sessions`. Set the Linear issue to In Progress and keep it there through review.
2. **Before pushing**: the `/commit` skill's validation ladder (micro / low-risk / high-risk), and `pnpm qa:code-quality-ratchet` from the worktree when the change adds lines to an existing file.
3. **Before merging**: the independent review gate — the OTHER harness reviews (Codex for Claude-authored, Claude for Codex-authored; a same-harness subagent is never sufficient by itself). Run it through `pnpm qa:codex-review` (`scripts/qa/codex-review.sh`: always `--base origin/main`, exit 2 with `GATE DID NOT RUN` on an abort, 1 on findings, 0 with the evidence line only when clean). The Claude half takes 5-20 minutes and prints nothing until done, so Codex runs it detached (`claude-review.sh --detach`, then `--wait 240` until the exit is not 3) and never under `timeout`; it needs the Keychain and the network, so it runs with escalated permissions outside Codex's sandbox, or Richard runs it from a terminal when escalation is not allowed. Record the verdict as a PR comment whose FIRST line is exactly `Review gate: <codex|claude> reviewed <base>..<head> — no findings` or `… — <N> findings, all addressed`; `.github/workflows/review-gate.yml` turns it into the required `Review gate` status pinned to that head SHA, so any later push turns it red until a new review is recorded. A review that finishes after the merge is an audit, not a gate. **Convergence — when to stop patching.** The gate re-runs on every new head and has no stop condition, so fix -> push -> review can loop indefinitely. Stop and restructure when either signal appears: the SAME file draws findings in three consecutive rounds, or a round returns only P2/P3 findings describing code the PREVIOUS round's fix introduced (dead branches, inert conjuncts, unreachable arms). Both mean the design is wrong, not the branch — a discriminator added to close one window opens the next (LESSONS `discriminator-branches`). Read severity, not count: a flat count while P0/P1 disappear is a loop, not progress. #2180 ran 15 rounds over ~15 hours with one file in 12 of them; collapsing four accreted flags into one discriminated state ended it in a single PR. On stopping, post the restructure proposal instead of another patch. If the reviewer is genuinely unavailable, the documented human-fallback path may be used: two adversarial subagent reviews, passing required checks, and a trusted owner/member's exact fallback attestation are required; see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 4.
4. **Before calling checks green**: `bash scripts/qa/watch-pr-checks.sh <pr>` (0 green · 1 a REQUIRED check failed, named · 2 head moved · 3 timeout, NOT a verdict · 5 required green but a non-required check failed). Never eyeball `statusCheckRollup`: "no pending checks" fires before CI registers, and the watcher reports only the FIRST required failure, so read the whole rollup before diagnosing.
5. **After merge**: a merge is not a deploy. Migrations need `supabase db push`, edge functions need `supabase functions deploy` (see the `deploy` skill), and a Vercel build-rate-limit failure on `main` leaves the previous bundle live — confirm a green production build on a `main` commit at or after yours before closing an issue.

### Reading the board

A default `list_issues` call sends `includeArchived: false`, and this workspace auto-archives closed issues on a team-settings window, so Done issues disappear from every default query once that window elapses. Pass `includeArchived: true` on any query that asks "has this already been filed, fixed, or rejected?" — deduplicating a finding, reconciling an audit ledger, checking closure, or resolving a `MYK9-<n>` cited in code. Without the flag an empty result means "not open", never "never existed". `get_issue` by id resolves archived issues with no flag; prefer it whenever the id is known, and never move an issue to Done from a `list_issues` result — it truncates descriptions, hiding acceptance criteria.

### Before editing

- Read the Linear issue, linked spec/plan, and relevant existing files; identify acceptance criteria and non-goals.
- Inspect the current implementation patterns, `git status`, and the worktree state before changing files. Preserve unrelated work.
- For UX-facing work, read `docs/INTENT.md`. For show-day, persistent-data, or authorization work, verify the established replication and RBAC paths before adding a new one.

### While editing

- Implement only the stated acceptance criteria. Do not change unrelated files, refactor opportunistically, or alter existing behavior unless the issue requires it.
- A small refactor is allowed only when necessary to meet acceptance criteria; keep it minimal and explain it in the PR.
- Follow existing architecture, naming, code style, and UI conventions. Preserve offline-first behavior and established mutation flows.
- Add or update tests for changes to logic, data flow, permissions, integrations, or user-visible behavior. For value-sensitive bugs, use assertion-first red-to-green coverage.

### Before opening a PR

- Run the narrowest useful verification for the touched files, review the diff for unrelated changes, and report any known unrelated broad-check failure plainly alongside targeted passing checks.
- The PR description follows `.github/pull_request_template.md` when present and includes: what and why, Linear issue, checked acceptance criteria, relevant visual evidence, risk, how to test, intentional non-goals, material agent involvement, and follow-up issues.
- Do not mark the Linear issue Done until its stated evidence gate is complete. Browser re-walks, OpenSpec verification, and operator/shared-system gates need recorded evidence or an explicit, owned acceptance.

### After implementation

Post a comment on the Linear issue with:

- **What changed** — summary of the implementation
- **Tests/checks run** — what was executed and the result
- **Branch or PR link**
- **Risks or remaining work**
- **Whether the acceptance criteria passed**

Move the issue to Done only after the PR merges, after reading its **full** description with `get_issue` and checking every criterion. Two files still take entries, but only when the work leaves something the issue does not carry: [`docs/qa/findings.md`](docs/qa/findings.md) for a QA finding that outlived the task, and [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) for standing debt that is deliberately _not_ a Linear task. Static code-quality debt goes in neither; the ratchet measures it.

### PR review standard

Review against the linked Linear issue and its acceptance criteria. Check for scope gaps, defects, data-flow regressions, unnecessary expansion, security concerns, poor abstractions, missing loading/error states, and code that will be hard to maintain. Do not suggest unrelated improvements unless they are severe. Return findings in three groups: must fix before merge; should fix soon; no blocking findings / safe to merge. Which review to use when, and the Codex second-opinion policy: [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 4.

## Worktree & Merge Workflow — hard rules

Full mechanics: [`docs/reference/git-workflow.md`](docs/reference/git-workflow.md). The non-negotiable rules:

1. **Work in a worktree, never the primary checkout,** whenever concurrent agents may be active — `.githooks/pre-commit` enforces this. Bypass once with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...` only for the docs-only-direct-to-`main` flow. Git worktrees share history but **not** gitignored files; `bash scripts/bootstrap-worktree.sh` installs deps, copies `.env`, builds packages and activates the hooks.
2. **Never run `gh pr merge` from inside a feature worktree** — run it from the main repo directory.
3. **Merge with `gh pr merge --squash`, never `--delete-branch`** — its local half fails while a worktree holds the branch, and the weekly branch-janitor reaps merged remotes.
4. **Leave the local branch.** Claude Code cannot delete it (`git branch -D` is a denied command there) and `-d` refuses squash-merged history. Codex may delete it after the worktree is removed, and only after proving the merge by SHA: `git rev-parse <branch>` must equal the merged PR's `headRefOid` — a PR matching the branch NAME is not proof, commits pushed after the merge are not in `main`.
5. **Worktree removal is always the final command of the cleanup sequence**, run from a path that still exists.
6. **Before a destructive history rewrite** (`reset --hard`, rebase drops, force-push), check for uncommitted edits in the working tree first — they get wiped, not carried.
7. **Own a merge through completion.** When asked to merge or enable auto-merge, re-check against current `main`, resolve or update the branch if needed, run focused verification, and keep monitoring until the PR merges or hits a real blocker. A red check is a verdict on the base it ran against: if its run predates the `main` commit that fixed that failure, merge `origin/main` in and push (a rerun keeps the stale merge ref) — and that push is a new head, so the review gate runs again. Stop for user input only when the failure is unrelated to the PR, risky to fix, or needs a product decision.

## Database Migrations

- Before writing a migration that references existing rows (e.g., permissions), QUERY the target table first to confirm referenced values exist.
- Run migration commands from the worktree linked to Supabase, not the main repo.
- Pick a migration timestamp against `origin/main` AND the linked database, not your branch (`pnpm qa:migrations:guard` runs in CI; a version another PR merged first dies at `INSERT INTO supabase_migrations.schema_migrations`). Use a specific odd time such as `174500`, never a shared default like `120000`, and never `supabase db push` from an unmerged branch.
- **Every `CREATE TABLE public.<name>` must include explicit `GRANT`s** to `anon` / `authenticated` / `service_role` as appropriate. As of Oct 30, 2026 Supabase no longer auto-exposes new `public` tables to the Data API (PostgREST / GraphQL / `supabase-js`); without a grant the table will silently 404 from the client. Template:

  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
  GRANT SELECT ON public.<table> TO anon;  -- only if anon should read
  REVOKE ALL ON public.<table> FROM anon;  -- REQUIRED if anon should have NO access
  ```

  Match the access level the table actually needs — never blanket-grant write to `anon`. Grants are orthogonal to RLS; both are still required.

- **Omitting a `GRANT` does NOT keep `anon` out — you must `REVOKE` explicitly.** This project carries `ALTER DEFAULT PRIVILEGES` in schema `public` granting `anon` full CRUD (`arwdDxtm`) on **every newly created table** (verified via `pg_default_acl`; grantors are both `postgres` and `supabase_admin`). Those default privileges take precedence over the Oct 30 change above, so a table meant to exclude `anon` gets full anon CRUD unless the migration says otherwise. Discovered 2026-07-25 on `dog_favorites` (migration `20260725130000` fixed it; RLS had masked the gap because every policy was `TO authenticated`). Wider audit: MYK9-93.

- **Verify grants against the applied database, not the migration text.** After `db push`:

  ```sql
  select unnest(relacl)::text from pg_class where oid = 'public.<table>'::regclass;
  ```

  Table-level ACLs are only half the picture — check column-level grants too. A broad `REVOKE ALL ON ALL TABLES ... FROM anon` silently drops them, `pg_class.relacl` will not show it, and a `select=*` PostgREST probe returns 200 either way:

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

One up-front confirmation covers a sequence of related pushes in the same session; re-confirm when switching to a new system or operation type. An explicit "ship this", "create a PR" or `/ship-pr` request authorizes the push, the PR creation and the review-gate comment for that branch; merging still needs its own authorization unless the request said to ship through completion.

**Exception — docs-only changes may go direct to `main`.** When a commit touches _only_ documentation files, skip the PR ceremony: commit on `main` (or fast-forward a feature commit into `main`) and push directly. No confirmation needed beyond the user's request to commit/push. `CLAUDE.md`, `AGENTS.md`, `docs/agents/shared-rules.md`, `.claude/**`, `.codex/**`, `.agents/**` and `.github/**` are always out of scope for this exception — they need a PR regardless of how small the change. Full in-scope/out-of-scope file list and the bypass mechanism: [`docs/reference/git-workflow.md`](docs/reference/git-workflow.md) § "Docs-only direct-to-`main`." Verify the commit's filelist matches the scope before pushing.

## Debugging seed-data / config bugs

Survey every related table in one query pass before writing a migration or code fix — the role table(s), the permission/config table(s), and the join/link table(s) together. The full recipe, and when to collapse the systematic-debugging ceremony, is [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 3.

## Browser automation session ownership

- Each task/run must own a unique Playwright CLI session. Never reuse a generic name such as `myk9-todo`, the default session, or another task's session.
- For scripted browser work, run `pnpm qa:browser-session sh path/to/browser-work.sh`. The wrapper supplies a unique `PLAYWRIGHT_CLI_SESSION`; commands inside the script must inherit it and must not override it with `-s` or another environment value. Keep the script in the foreground and wait for all browser work before returning.
- The wrapper closes only its session on success, failure, SIGINT, or SIGTERM. Failed or timed-out cleanup fails the run and prints the exact session to inspect. It cannot clean up after SIGKILL, a runtime crash, or power loss.
- For interactive agent work spanning separate tool calls, choose a unique task/run name, pass `-s=<name>` on every command, and close that exact session before finishing, handing off, or abandoning the task. A one-command wrapper cannot preserve a browser across separate tool calls.
- Check `playwright-cli list` before starting and after cleanup. Do not use `close-all`, `kill-all`, or blanket Chrome process termination as routine cleanup: concurrent agents may own other sessions. Do not delete browser profiles to resolve a hung session.
- If an owner is interrupted before cleanup, verify that its task has ended before closing the recorded session. Process age or low CPU alone is not evidence that a session is abandoned.

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

## Planning

Save plans to `docs/plan-<topic>.md`, never chat-only. Follow existing plans when they exist. **Every plan must include a testing phase** — a phase isn't complete until its tests pass. Directly under the `# Title`, add `> **Status:** Active` (`Active` / `Complete` / `Abandoned`) and register one row in [`docs/README.md`](docs/README.md); on merge, flip to `Complete`, `git mv` into `docs/archive/`, drop the index row. Full lifecycle rules: [`docs/README.md`](docs/README.md).

**OpenSpec carve-out.** When a single unit of buildable work goes through the opsx skills, the OpenSpec change (`openspec/changes/<id>/`) _is_ the plan — do not also author a `docs/plan-*.md` for the same work. When each format applies, and how to cross-link if both exist: [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 1.

## Self Learning

When I correct you or you catch yourself making a mistake, before continuing, add the lesson as a one-line rule under LESSONS so it never happens again.

A LESSON may be **retired** once the trap is structurally impossible — a guard, test, lint rule, or type now catches it, or the code path no longer exists. Delete the line and cite the PR that made it unreachable in the commit message. LESSONS is for traps only a human could have known about; anything a check already enforces is noise.

## LESSONS

One to three lines per lesson: the rule, the mechanism, and a pointer to the incident in [`docs/lessons/README.md`](docs/lessons/README.md). A lesson whose trap is now caught by a program is a one-line pointer at that program. `apps/myk9show/src/test/ci/instructionFileBudget.test.ts` enforces the shape.

- **No Docker here.** Use the configured Supabase/staging workflows for database and browser verification; behavioral SQL tests run only in CI. (docs/lessons/README.md#no-docker)
- **Done issues auto-archive and vanish from every default Linear query**, so a dedupe or "did we already fix this?" search without `includeArchived: true` reads _shipped_ as _never seen_ and re-files it. Prefer `get_issue` by id, which resolves archived issues. The workspace left the free tier on 2026-09-01 but auto-archive is a setting and still runs. (docs/lessons/README.md#linear-include-archived)
- **`codex review` exits 0 when it never reviewed anything, and `--commit` reviews one commit.** Both traps are closed by `pnpm qa:codex-review` (`scripts/qa/codex-review.sh`); never call `codex review` directly from a skill. (docs/lessons/README.md#codex-review-exit-code)
- **Never move a Linear issue to Done from a `list_issues` result** — it truncates descriptions, hiding acceptance criteria below the fold. `get_issue` the full description and check every AC first. (docs/lessons/README.md#linear-done-from-list)
- **CI shuffles vitest (`--sequence.shuffle`); local runs do not**, so a test that leaks state passes every local run and fails randomly in CI. Run the whole suite shuffled (`pnpm vitest run --sequence.shuffle`, never `pnpm test --sequence.shuffle`, which pnpm swallows) — once when the change adds no module-scope mutable state, 6+ when it does, and fix leaks with an O(1) `beforeEach` reset. CI's deterministic shards can never surface a leak between files in different shards. (docs/lessons/README.md#vitest-shuffle)
- **A timeout-class flake needs shuffle order AND a slow environment**: replay with `taskpolicy -b pnpm vitest run <file> --coverage --sequence.shuffle`, and keep the `beforeEach` reset O(1) in the leaked state's size (`store.clear()`, not per-row deletes). (docs/lessons/README.md#timeout-class-flake)
- **`git branch -D`/`-d` and `git checkout -- <path>` are denied here**; in an unattended run that is a silent stall. Discard with `git restore`, merge with `gh pr merge --squash` without `--delete-branch`, leave local branches for `branch-janitor`. (docs/lessons/README.md#git-branch-delete-denied)
- **`supabase functions deploy --workdir apps/myk9show` follows that dir's tracked `.temp/project-ref`.** Do not untrack the `.temp/*` files (gitignore does not apply to tracked files), always pass `--project-ref sojmvhhwsjxmfistvzbe`, and confirm the "Deployed Functions on project …" line names it. (docs/lessons/README.md#functions-deploy-workdir)
- **If a background-task chip's work gets absorbed into the current session, dismiss the chip immediately**, or the user may start it and duplicate the work. (docs/lessons/README.md#dismiss-absorbed-chip)
- **A `docs/plan-*.md` needs its status line and `docs/README.md` index row in the same edit**; `pnpm qa:plans` runs in CI and fails without them. (docs/lessons/README.md#plan-status-line)
- **Edge-function tests must run under `// @vitest-environment node`**: the global jsdom environment installs its own `ArrayBuffer`, so `crypto.subtle.digest` rejects buffers built in test code, and whether it fires depends on the Node build. Hand WebCrypto the TypedArray view directly, and keep `src/test/setup.ts`'s `window` guard. (docs/lessons/README.md#edge-tests-jsdom)
- **A PostgREST count must name a column, never `*`, on a column-allowlisted table** — `select('*', { count:'exact', head:true })` on `entries` returns 403 with an empty body, React Query masks it as a retry, and an unfocused tab parks it at `fetchStatus:'paused'` forever. Use `select('id', …)`. (docs/lessons/README.md#postgrest-count-column)
- **PostgREST needs table-level SELECT on every embedded relation**: revoking anon on a table reached only via `table(col,…)` embeds turns a null embed into a hard 42501 that fails the whole request. Grep for embeds, not just `.from('table')`. (docs/lessons/README.md#postgrest-embed-grants)
- **A "missing" column is not automatically drift.** Check `supabase_migrations.schema_migrations` and recently merged PRs for a deliberate `drop_*` before writing a repair migration; a stale branch makes an intentional deletion look unapplied. (docs/lessons/README.md#missing-column-not-drift)
- **App tests import every package's built `dist`**, so a stale build gives a false `tsc` failure and a false vitest pass at once. `pnpm qa:dist-fresh` fails when any package's `src/` is newer than its `dist/`; the app's `pnpm test` runs it first, `pnpm exec vitest` does not. (docs/lessons/README.md#stale-package-dist)
- **Keep scratch `.sql` out of `supabase/migrations/`** — migration-parsing tests read the whole directory and fail an untracked file with a confusing ACL error. (docs/lessons/README.md#untracked-migration-sql)
- **`SlideOverPanel`'s `size` prop is inert** (a fixed breakpoint chain overrides it); override via `className` for one panel and see MYK9-99 before fixing it globally. (docs/lessons/README.md#slideover-size-inert)
- **Pick a migration timestamp against `origin/main` and the linked database, not your branch**; `pnpm qa:migrations:guard` runs in CI. Use a specific odd time such as `174500`, never `120000`, re-check after a long-running branch, and never `supabase db push` from an unmerged branch. (docs/lessons/README.md#migration-timestamp)
- **An ACL audit must cover sequences (`relkind='S'`), not just tables and columns**: a BEFORE INSERT trigger's `nextval()` fires before RLS `WITH CHECK`, so a table INSERT grant dies 42501 on the sequence. Do not resolve reachability — a trigger's standalone sequence is tied to its table by neither dependency nor name (`enrollments` → `registration_confirmation_seq`). List every `relkind='S'` in `public`; there are only four. Query in the `db-push` skill. (docs/lessons/README.md#sequence-privileges)
- **`anonEntriesGrantContract` hoists `EXECUTE '…'` payloads out of `DO $$` blocks to the end of the file**, so a version-guarded blanket `REVOKE` inside a `DO` reads as running last. Keep blanket revokes as plain statements ordered before the grants. (docs/lessons/README.md#grant-contract-splitter)
- **A `GRANT` can never narrow an earlier broader `GRANT`** — codifying a tighter ACL needs its own explicit `REVOKE`, and only a rebuild-from-migrations diff catches the gap; the text reads correct either way. (docs/lessons/README.md#grant-never-narrows)
- **A branch matching a merged PR's `headRefName` is not proof it merged** — commits pushed after the merge or a re-created template-named branch leave the tip ahead of what landed. Compare the tip SHA against the PR's `headRefOid`; `scripts/reap-merged-branches.sh` does. (docs/lessons/README.md#headrefname-not-merged)
- **Before `CREATE OR REPLACE`-ing a Postgres function, copy from the LATEST migration that defines it** (`grep -l "CREATE OR REPLACE FUNCTION public.<fn>" supabase/migrations/`), never from the canonical-looking file; rebuilding from an old one silently reverts later shape changes that typecheck and tests cannot see. (docs/lessons/README.md#replace-function-latest)
- **A red CI check is a verdict on the base it ran against**: compare the PR's `baseRefOid` with `origin/main` and the run's timestamp with the merges between; a stale red needs a merge from `origin/main` and a push, not a rerun. The tell is one PR failing a job another PR passes. (docs/lessons/README.md#stale-red-check)
- **A red `/admin/health` check is a verdict from when it last RAN**: keys outside `CONTINUOUS_HEALTH_CHECK_KEYS` re-measure only on the 07:00 UTC full run and are copied forward verbatim for up to 24h. Prove deployment by grepping the live bundle (`get_edge_function`), never by a timestamp, and ask the user to click "Run now" rather than redeploying. (docs/lessons/README.md#stale-health-check)
- **`pg_get_viewdef(...) ilike '%deleted_at is null%'` reports false positives** (nested subqueries, and `%e.deleted_at%` matches `own_e.deleted_at`). Slice the view's own top-level `WHERE` and anchor the alias; check `security_invoker` too, since `false` means the view body is the only guard. (docs/lessons/README.md#view-predicate-audit)
- **`SELECT e.*` inside a view re-expands on every rebuild**, publishing every column the base table gained since. Replace the star with the explicit column list the live view returns, which also lets `CREATE OR REPLACE` work instead of `DROP` (which resets the ACL and needs `CASCADE`). (docs/lessons/README.md#select-star-reexpands)
- **`CREATE OR REPLACE VIEW` resets `reloptions`**, so without an inline `WITH (security_invoker = …)` the view falls back to owner-run and skips RLS entirely (20260817170000, reverted by 20260817190000). Carry the `WITH` clause on every replace, and assert `reloptions` after a push, folding NULL to false. (docs/lessons/README.md#replace-view-reloptions)
- **Offline-first covers domain data; identity and permissions must be as offline-durable as the data**, or a cold offline boot holds `hasRole(JUDGE)` with `personId === undefined` and every hook keyed on `databaseUserId` reports "no rows" as fact. Treat unresolved identity as its own state, and when you make one half of a coupled pair offline-durable, ask what still is not. (docs/lessons/README.md#offline-identity-pairing)
- **Partitioning a dataset re-arms every guard written when the set was whole.** Before adding a filter, grouping or scope to an existing list, grep the downstream math for clamps, `Math.max(0, …)` and "these always come in pairs" assumptions. (docs/lessons/README.md#partition-rearms-guards)
- **A `SECURITY DEFINER` function that omits a filter its calling policy applies may be a deliberate edge, not drift** (`manageable_show_ids()` keeps draft and soft-deleted shows visible on purpose). Before restating a predicate inside, grep `supabase/tests/` for a test naming the function and read its header; behavioral SQL tests only ever run in CI. (docs/lessons/README.md#definer-deliberate-edge)
- **A test that greps source text proves someone typed the thing, not that it does anything**, so it certifies a no-op as a fix. Assert rendered geometry or behavior, and when a fix's premise is "library X defaults to Y", read the installed package first. (docs/lessons/README.md#source-text-tests)
- **CI's `pnpm qa:code-quality-ratchet` has no local equivalent in typecheck, lint or tests**; run it from the WORKTREE (from the primary checkout it silently measures `main`) before pushing anything that adds lines to an existing file, and fix a file over 500 lines by extracting a sibling module. (docs/lessons/README.md#code-quality-ratchet)
- **Never log to `/tmp/<name>.log`**: it is shared by every session on this Mac and two runs interleave into one file that reads like a single run. Use `.logs/` at the worktree root and read the `RUN` header's path before believing a summary. (docs/lessons/README.md#shared-tmp-log)
- **A run piped through `tail`/`grep` reports the filter's exit code**, so a red suite prints "completed (exit code 0)" and the failing test's name is cut off. Redirect to a file and echo `EXIT=$?`; same for `typecheck`/`lint` and for `vitest run` in an `&&` chain. (docs/lessons/README.md#pipe-exit-code)
- **A vitest `Test timed out in Nms` names the `it()`, not what was running when the clock expired.** Instrument phases with `performance.now()` before concluding anything; `userEvent.type` into a controlled input bound to a persisted zustand store costs ~512ms/char under coverage, so type the fewest characters the assertion needs. (docs/lessons/README.md#vitest-timeout-names-it)
- **The confirm click is a destructive click too, and `.last()`/`.first()` on a destructive control picks another row.** Anchor every destructive click to the row that owns it, scope the confirm to `[role="dialog"]`, assert the dialog appeared before looking inside it (Revoke has no confirm, MYK9-284), and assert the count you expect afterwards; on shared staging the coin is someone else's fixture. (docs/lessons/README.md#confirm-click-destructive)
- **A "is my fix deployed?" probe must match a string that exists ONLY in that change** — confirm it is absent from `origin/main~1` first, and crawl the chunk graph from `index.html`, since a lazily-loaded page chunk is not in the entry chunk. A deploy timestamp is not a substitute. (docs/lessons/README.md#deploy-probe-unique-string)
- **"No pending checks" is not "settled"**: seconds after a push the rollup shows the previous head's verdict or a lone fast status context. Never hand-roll the poll — run `bash scripts/qa/watch-pr-checks.sh <pr>` (0 green · 1 a required check failed · 2 head moved · 3 timeout, not a verdict · 5 required green, non-required failed); every ad-hoc rewrite has been wrong in a new way and the failure mode is always a confident green. (docs/lessons/README.md#ci-poll-settled)
- **When a test asserts the opposite of the fix you are about to make, `git log -S` the assertion string**, not `git blame` the implementation line; blame lands on the last refactor, `-S` finds the commit that chose it. Treat "I had to rewrite a test to make this work" as a stop sign, and grep the action catalog before concluding a capability has no path. (docs/lessons/README.md#git-log-s-assertion)
- **Replacing a cascading DELETE with an upsert drops three properties**: clearing soft-delete columns, resetting declared rows, and removing undeclared ones. Enumerate the children from `pg_constraint` (`confdeltype='c'`), replicate the cascade explicitly with no exemptions, and pin the list in a test. Collision-safety and reset are different properties. (docs/lessons/README.md#cascade-delete-vs-upsert)
- **A field plumbed through the data layer can be dropped at the last hop** by a hand-picked `.map(…)` projection, and a unit test on the pure function cannot see it. When a fix adds a field to a prop, check every projection over that prop, and pin it with a test that renders the component on the real prop shape. (docs/lessons/README.md#last-hop-drop)
- **A comment naming the thing satisfies any grep-based test or guard.** Assert behavior (extract and run the shell/function against a stub); when a guard must know "does anything invoke X", prefer a declared list that fails loud on omission over a scan that guesses. (docs/lessons/README.md#comment-satisfies-grep)
- **A mutation test you don't confirm actually mutated is a green light you trust too much.** Match headings on the exact line, never `index()`, and after mutating print WHERE the change landed before believing the verdict. (docs/lessons/README.md#mutation-actually-mutated)
- **`tsc --noEmit -p tsconfig.json` typechecks nothing in `apps/myk9show` and exits 0** (solution-style, `"files": []`). Use `pnpm typecheck` for the gate and `npx tsc --noEmit -p tsconfig.app.json` for a fast scoped check; when a check is suspiciously fast and silent, verify it fails on a deliberate error. (docs/lessons/README.md#tsc-solution-tsconfig)
- **A PR that conflicts with its base gets NO workflow runs and nothing says so** — every trigger fires and produces zero runs while Vercel still goes green. Before diagnosing a missing run, read `gh api repos/<owner>/<repo>/pulls/<n> --jq '{mergeable, mergeable_state, merge_commit_sha}'`; `merge_commit_sha: null` is the diagnosis and merging the base in is the fix. (docs/lessons/README.md#conflicting-pr-no-runs)
- **A measurement harness is a program; an unverified one reports its own bugs as findings about the app**, and so does the assertion you write afterwards. Give any contrast or geometry harness known-answer checks that print with the findings, composite over white and black rather than parsing colour strings, walk to a larger clickable ancestor or `label[for]` before reporting a small control, assert the worst case over ALL matches after real content loads, and measure tokens against the rendered composited surface, not the flat pair. (docs/lessons/README.md#measurement-harness)
- **GitHub evaluates `${{ }}` inside a composite action's `description:` fields**, so documenting an expression executes it and the whole action fails to load. `scheduledFailureNotification.test.ts` fails on any unresolvable context in `.github/actions/*/action.yml`. (docs/lessons/README.md#composite-action-expression)
- **When a suite has never run, every red is a claim about the harness first**, and a green in it may be a test that cannot fail. Read the failure artifact before theorising, audit every stale locator in one pass rather than one CI round trip each, and give any absence-assertion a positive control on the same page and collector. (docs/lessons/README.md#dead-suite-reds)
- **A review that finishes after the merge is an audit, not a gate.** The `Review gate` status is pinned to the head SHA; finish the review and act on its findings before announcing a PR as ready, and say "review running" out loud as a blocking state. (docs/lessons/README.md#review-after-merge)
- **A fix that adds a discriminator creates new branches, and the original bug can survive inside one of them.** Re-read the original complaint against each new branch, and never discriminate on a net money figure: it is zero in two different worlds. (docs/lessons/README.md#discriminator-branches)
- **A Vercel check whose `targetUrl` ends `?upgradeToPro=build-rate-limit` is an account quota, not a verdict**; GitHub leaves the PR `MERGEABLE`/`UNSTABLE`. Merge on the Actions jobs plus the app's own Vercel context and say which check you ignored — but the same limit fails the `main` build and leaves the previous bundle live, so before closing an issue confirm a green production build on a `main` commit at or after yours. (docs/lessons/README.md#vercel-rate-limit)
- **`E2E PR Smoke` fails on any failed network response under `vite preview`**, so gate platform-only scripts (Vercel Analytics, Speed Insights) on the hostname. (docs/lessons/README.md#pr-smoke-network)
- **An anchored text edit written from the text you WROTE misses after the formatter runs**, and a chained script then carries on past the miss. Re-read the file after any format step before anchoring, or anchor on structure with a regex, and make chained scripts stop at the first failed step. (docs/lessons/README.md#anchored-edit-after-format)
- **A guard that splits a command on whitespace is off for every path with a space in it, which is this repo's own path.** Tokenize quote-aware, match on subcommand plus flag set, and replay the guard's verdict against known-answer fixtures on every change. (docs/lessons/README.md#guard-word-split)
- **`local s="$1" n=${#s}` measures the CALLER's `s`** — the shell expands every word before running `local`. Split the declaration whenever one `local` refers to another on the same line; nothing warns, the function is simply inert. (docs/lessons/README.md#local-self-reference)
- **A run whose conclusion is `cancelled` may be one job hitting its own `timeout-minutes`, not concurrency.** Both read identically at run level; `gh run view <id> --json jobs` tells them apart, and a timed-out job's `startedAt`/`completedAt` span is exactly its cap. On 2026-09-07 eight `main` runs read as cancelled after the concurrency fix, and every one was the coverage job's 30-minute cap that cancel-on-push had been hiding. (docs/lessons/README.md#cancelled-may-be-timeout)
- **In zsh, `read path` (or any assignment to `path`, `PATH`, `cdpath`, `fpath`, `manpath`) silently replaces the command search path**, because `path` is the array tied to `PATH`. Every command after the first iteration of a `while read -r path` loop then fails with `command not found`, and a loop that echoes its own computed fields prints them empty and exits 0. Name loop variables `wtdir`, `p`, anything but the tied names; the same applies to scripts run under `zsh` but not under `bash`. (docs/lessons/README.md#zsh-read-path)
- **`watch-pr-checks.sh` reports the FIRST required check to fail, not every one**, so one red hides the others; its exit code is a merge gate, not a diagnosis. Read the whole rollup before concluding what is wrong, and remember the local gate set does not run the unit suite. (docs/lessons/README.md#watcher-first-failure)
- **"Check for in-flight work first" is worth nothing unless a program runs it**: `pnpm qa:inflight` fails when an open PR, another worktree (including uncommitted files) or a recent unmerged branch overlaps the paths; older local refs remain counted as inventory, and `--verbose` expands them. Linear In Progress and `list_sessions` stay manual. A forked audit session that meets housekeeping noise should file it, not fix it. (docs/lessons/README.md#inflight-check)
