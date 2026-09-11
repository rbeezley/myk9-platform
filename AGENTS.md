# AGENTS.md

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

## Commands

Package manager: **pnpm** (never `npm` or `npx`). Root scripts (`dev:show`, `build`, `typecheck`, `lint`) are in `package.json`; `pnpm dev:show` serves myK9Show at http://localhost:5173. The non-obvious ones:

```bash
# Testing (run from app directories)
cd apps/myk9show && pnpm test     # myK9Show unit tests (vitest); runs qa:dist-fresh first
cd apps/myk9show && pnpm test:e2e # myK9Show E2E tests (playwright)

# Run one or more targeted test files
cd apps/myk9show && pnpm vitest run src/path/to/file.test.ts [src/path/to/another.test.ts]
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

1. **Before starting** work that will produce a PR: `pnpm qa:inflight` (exit 1 = an open PR, another worktree, or an unmerged branch already touches these paths; exit 2 = could not decide, not a pass), then the two checks a shell cannot make: Linear issues **In Progress** naming the paths, and (Claude Code) `list_sessions`. Set the Linear issue to In Progress and keep it there through review.
2. **Before pushing**: the `/commit` skill's validation ladder (micro / low-risk / high-risk), and `pnpm qa:code-quality-ratchet` from the worktree when the change adds lines to an existing file.
3. **Before merging**: the independent review gate — the OTHER harness reviews (Codex for Claude-authored, Claude for Codex-authored; a same-harness subagent is never sufficient by itself). Run it through `pnpm qa:codex-review` (`scripts/qa/codex-review.sh`: always `--base origin/main`, exit 2 with `GATE DID NOT RUN` on an abort, 1 on findings, 0 with the evidence line only when clean). The Claude half takes 5-20 minutes and prints nothing until done, so Codex runs it detached (`claude-review.sh --detach`, then `--wait 240` until the exit is not 3) and never under `timeout`; it needs the Keychain and the network, so it runs with escalated permissions outside Codex's sandbox, or Richard runs it from a terminal when escalation is not allowed. Record the verdict as a PR comment whose FIRST line is exactly `Review gate: <codex|claude> reviewed <base>..<head> — no findings` or `… — <N> findings, all addressed`; `.github/workflows/review-gate.yml` turns it into the required `Review gate` status pinned to that head SHA, so any later push turns it red until a new review is recorded. A review that finishes after the merge is an audit, not a gate. If the reviewer is genuinely unavailable, the documented human-fallback path may be used: two adversarial subagent reviews, passing required checks, and a trusted owner/member's exact fallback attestation are required; see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 4.
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

## Worktrees — mandatory start check (Codex)

Before any code edit, file write, formatter, generated snapshot, commit, PR, or implementation work:

1. Run `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`.
2. If already in a linked worktree (`git-dir` differs from `git-common-dir`), continue there.
3. If in the primary checkout on `main`, stop and create a feature worktree/branch first (`git worktree add ../wt-<task> -b <branch>`), then `bash scripts/bootstrap-worktree.sh` inside it.
4. Do not edit files in the primary checkout except docs-only direct-to-`main` work explicitly approved by the user (scope in the shared rules above).

This check happens before `apply_patch` or any other file-writing command; the pre-commit hook enforces the same invariant at commit time, this check prevents dirtying the primary checkout in the first place.

## Planning

When creating implementation or remediation plans, always save them to a markdown file (e.g., `PLAN.md` or `docs/plan-<topic>.md`) rather than only outputting to chat. Follow existing plans when they exist — do not start from scratch. **Every plan must include a testing phase** — unit tests for new components, hooks, and utilities. Do not consider a phase complete until its tests are written and passing.

## OPSX / OpenSpec Workflow

Prefer OPSX for non-trivial launch-readiness and product changes, especially when work needs a durable proposal/spec, remediation plan, implementation, verification, PR, archive, or cleanup. If the user says "OPSX", "opsx ship", "OpenSpec", "batch", "go-live", "launch readiness", or asks to ship a scoped change end-to-end, read and use the `opsx-ship` skill first.

Use the OPSX phase skills it delegates to (`openspec-propose`, `openspec-apply-change`, `openspec-verify-change`, `ship-pr`, `openspec-archive-change`, and `cleanup`) instead of reconstructing that process from memory. Preserve `opsx-ship` branch-safety checks and shared-system approval gates.

For tiny docs-only edits, test-only nits, or narrow review fixes, the lightweight workflow is fine. If skipping OPSX on non-trivial fall-2026 launch-readiness work, state why in the response or saved plan.

## PR reviews

When asked to review a PR, run focused verification by default when practical:

- Inspect the diff for defects first.
- Run relevant unit tests, package builds/typecheck, or narrow app builds tied to the changed files.
- If a suite hangs or exceeds 60 seconds without useful output, stop and report it.
- Skip verification only for docs-only changes or when blocked, and say why.

## Small Maintenance Changes

**Docs-only tracking edits go direct to `main` by default.** For files in the `CLAUDE.md` docs-only-direct-to-`main` scope (`docs/**/*.md`, top-level tracking/reference docs, package/function READMEs):

- Commit and `git push origin main` directly — no branch, no PR, no per-session approval needed. As of 2026-06-14 the `main` rulesets grant the admin role (the owner token) `bypass_mode: always`, so the push succeeds; the PR + required-checks gates are bypassed for that identity. The restriction is convention, not enforcement, so stay strictly inside the docs-only scope.
- From the primary checkout while linked worktrees exist, prefix with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...` (the local pre-commit guard is separate from the ruleset and still applies).
- Validate with `git diff --check` plus targeted `rg` checks. Do not run app tests/typecheck for Markdown-only changes.

For skill, agent-prompt (`.claude/**`), or any other **out-of-docs-scope** small edits — these still require a PR:

- Prefer one standing maintenance worktree/branch instead of one branch per tiny change. Default branch name: `codex/maintenance-notes`. It still passes through `pnpm qa:inflight` before each batch — a standing branch is exactly the shape that overlaps someone else's open PR without noticing.
- Batch related small edits into one commit/PR when practical.
- Do not run app tests/typecheck unless TypeScript, app code, migrations, or executable scripts changed.
