# AGENTS.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Product Goal

Default long-term goal: make myK9 launch-ready for fall 2026, with secretary/show-day reliability as the highest priority. Use [`docs/goals/fall-2026-launch-readiness.md`](docs/goals/fall-2026-launch-readiness.md) as the prioritization frame when choosing and executing backlog work.

## Current development phase — consolidate, don't duplicate

The project is **pre-launch with no real users yet** for the monorepo myK9Show app. The old monorepo `apps/myk9q` app has been deleted after being absorbed into myK9Show `/at-show`; do not rebuild it. The current phase is focused on **simplifying and consolidating** — making a smooth, intuitive, logical workflow across the app. We are **not** in a phase of building new isolated features or adding more surface area.

This shapes every UX decision. Before proposing a new page, sheet, dialog, or affordance:

1. **Search for the existing surface first.** If a feature looks like it duplicates an existing page (e.g., "approve entries" exists on both the workbench *and* the Entries Management page), that is a smell. Add a *link* between the surfaces; do not reimplement.
2. **A fast path is not always new UI.** If the user needs a quicker way to do something that exists on page B, the answer is often a deep-link from page A to page B with filters pre-applied — not a re-implementation on page A.
3. **One concern, one page.** When in doubt about whether work belongs on page A or page B, ask. Don't guess by adding both. The workbench-collapse plan ([`docs/plan-show-map-workbench-collapse.md`](docs/plan-show-map-workbench-collapse.md)) is the precedent: it deleted Today + Wrap-up tabs not because they were wrong, but because their concerns belonged in fewer places.
4. **State the duplication question explicitly when proposing a feature.** Before building, answer: *"Does this duplicate an existing page? If so, why is duplication justified instead of a link?"* If the answer is "yes, no strong justification," narrow scope before writing code.
5. **Deletions are a feature.** Removing a redundant surface is as valuable as adding a missing one — often more so at this phase. If you find yourself building something that overlaps an existing page, propose deleting the overlap.

The mental model: the user's experience is a single coherent workflow, not a menu of independent screens. Every new affordance either tightens that workflow or fragments it. Default to tightening.

## Intent & Emotional Design

**Before making UX-facing changes, read [`docs/INTENT.md`](docs/INTENT.md).** It defines the emotional intent behind each role's experience. Every optimization, refactoring, or "improvement" to user-facing code should preserve the target feeling for that role. If code has an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

## Development Principles

1. **Don't guess or assume** — Verify facts, check actual code, ask if uncertain
2. **Follow DRY principles** — Don't Repeat Yourself. Create reusable components if possible
3. **Follow SLC** — Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete)
4. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules
5. **Protect intent** — When code looks "wrong" but has an `// INTENT:` comment, it's deliberate. When making UX changes, check if they preserve the role's target feeling (see `docs/INTENT.md`)

## Worktrees

### Mandatory start check

Before any code edit, file write, formatter, generated snapshot, commit, PR, or implementation work:

1. Run `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`.
2. If already in a linked worktree (`git-dir` differs from `git-common-dir`), continue there.
3. If in the primary checkout on `main`, stop and create or enter a feature worktree/branch first. Use the `EnterWorktree` tool when available, otherwise follow the Worktrees section below.
4. Do not edit files in the primary checkout except docs-only direct-to-`main` work explicitly approved by the user. See `CLAUDE.md` for the docs-only direct-to-`main` scope.

This check happens before `apply_patch` or any other file-writing command.

> Note: the pre-commit hook described below enforces this same invariant at commit time; this start check prevents dirtying the primary checkout in the first place.

Git worktrees share history but **not** gitignored files (`node_modules/`, `.env`, `dist/`). A `PostToolUse` hook runs `scripts/bootstrap-worktree.sh` automatically after `EnterWorktree`. If something is missing, run it manually:

```bash
bash scripts/bootstrap-worktree.sh   # installs deps, copies .env, builds packages, activates git hooks
```

**Work in a worktree, never the primary checkout, when other agents may be active.** This repo is regularly worked by concurrent agents (Codex + Claude); committing from the primary tree — especially `git add -A` — sweeps another agent's untracked WIP. This is enforced: `.githooks/pre-commit` blocks a commit from the primary working tree while any linked worktree exists (bootstrap activates it by repointing `core.hooksPath` at `.githooks`, handling this repo's `extensions.worktreeConfig` overrides — see `.githooks/README.md`). Compliant worktree commits and solo no-worktree work are unaffected. Bypass the documented docs-only-direct-to-`main` flow with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...`.

## Planning

When creating implementation or remediation plans, always save them to a markdown file (e.g., `PLAN.md` or `docs/plan-<topic>.md`) rather than only outputting to chat. Follow existing plans when they exist — do not start from scratch. **Every plan must include a testing phase** — unit tests for new components, hooks, and utilities. Do not consider a phase complete until its tests are written and passing.

## OPSX / OpenSpec Workflow

Prefer OPSX for non-trivial launch-readiness and product changes, especially when work needs a durable proposal/spec, remediation plan, implementation, verification, PR, archive, or cleanup. If the user says "OPSX", "opsx ship", "OpenSpec", "batch", "go-live", "launch readiness", or asks to ship a scoped change end-to-end, read and use the `opsx-ship` skill first.

Use the OPSX phase skills it delegates to (`openspec-propose`, `openspec-apply-change`, `openspec-verify-change`, `ship-pr`, `openspec-archive-change`, and `cleanup`) instead of reconstructing that process from memory. Preserve `opsx-ship` branch-safety checks and shared-system approval gates.

For tiny docs-only edits, test-only nits, or narrow review fixes, the lightweight workflow is fine. If skipping OPSX on non-trivial fall-2026 launch-readiness work, state why in the response or saved plan.

## Commands

```bash
# Package manager: pnpm (not npm)
pnpm install          # Install all dependencies
pnpm dev:show         # Run myK9Show dev server (localhost:5173)
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check across monorepo
pnpm lint             # ESLint across monorepo

# Testing (run from app directories)
cd apps/myk9show && pnpm test     # myK9Show unit tests (vitest)
cd apps/myk9show && pnpm test:e2e # myK9Show E2E tests (playwright)

# Run a single test file
cd apps/myk9show && npx vitest run src/path/to/file.test.ts
# Run tests matching a name pattern
cd apps/myk9show && npx vitest run -t "pattern"
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

### Heritage / registry columns (migrations 192–193)

- `shows.landing_style` — `'default' | 'heritage'`. Read via `getShowLandingStyle(show)` from `@/features/registries`.
- `trials.registry_id` — sanctioning body (default `'AKC'`). Read via `getTrialRegistry(trial)`.
- `trials.confirmation_date` — when the Heritage confirmation email is sent. NULL = no formal step.
- `trials.timezone` — IANA name (default `'America/New_York'`). Read via `getTrialTimezone(trial)`.
- `entries.confirmation_email_sent_at / message_id / status` — idempotent send tracking (`'pending' | 'sent' | 'bounced' | 'failed'`).

## Deployment

- **myK9Show staging:** myk9-platform-myk9show.vercel.app (auto-deploys from `main`)
- **Legacy production myK9Qv3:** myk9q.com (separate repo, untouched)

### Vercel Hobby quota / preview deploy discipline

This repo has multiple Vercel projects on a Hobby account, so PR preview deployments can hit the daily deployment-created limit. Follow [`docs/operations/vercel-preview-quota.md`](docs/operations/vercel-preview-quota.md) for the full runbook.

- Before pushing a PR branch, batch local fixes and run the relevant local checks/review first; avoid micro-pushes that only exercise Vercel again.
- Vercel preview contexts are intentionally not required by the GitHub `main-required-checks` ruleset. If a guides/app preview is rate-limited but GitHub required checks are green, treat that as non-blocking unless the preview itself is needed for visual QA.
- Before changing Vercel project settings, confirm the shared-system mutation with the user. The desired Vercel setting is monorepo skip-unaffected projects, not an Ignored Build Step workaround.

## Key Patterns

### Offline-first data

myK9Show and its shared ringside packages are offline-first where show-day reliability requires it. Always use replicated tables / replication-backed query functions for persistent app data that must work offline — never bypass with direct Supabase reads in core flows (breaks offline):

```typescript
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

For myK9Show, core reads should go through the replication-backed query/table layer. Direct PostGREST remains acceptable only for explicitly online-only or auth-adjacent paths documented in the migration design (for example user/auth queries, RPCs, checkout/promo flows, or other out-of-scope admin utilities). Mutations should use the established mutation manager / replication workflow for the area being changed.

### State Management

| Tool                  | Use For                                  | Examples                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| **Zustand**           | Client/UI state shared across components | Modals, filters, selections, domain stores |
| **React Query**       | Server state, async data fetching        | Lists, detail views, search results        |
| **React Context**     | Cross-cutting concerns (rarely changes)  | Auth/RBAC, theme, app-wide config          |
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, ringside scoring |
| **Local `useState`**  | Ephemeral, component-scoped state        | Form inputs, timers, dialog open/close     |

## Testing

Always ensure generated test code compiles cleanly: no `await` outside `async`, no unused variables (remove them, don't underscore-prefix), and run the test suite before considering work complete.

When test runners hang or appear stuck for more than 60 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

Use the custom render from `src/test/utils/testUtils.tsx` instead of raw `render` — it wraps with QueryClient, Auth, and Router providers.

**Assertion-first for value-sensitive bugs.** When a bug involves a specific value going to a specific place (enum string to a DB column, key in a response object, header in an HTTP call), write the `expect(...).toHaveBeenCalledWith(...)` line first and run it red before touching the implementation. A failing test proves the current wrong value; the fix then flips it green. This catches silent overwrites that visual inspection and typechecking miss.

### PR reviews

When asked to review a PR, run focused verification by default when practical:

- Inspect the diff for defects first.
- Run relevant unit tests, package builds/typecheck, or narrow app builds tied to the changed files.
- If a suite hangs or exceeds 60 seconds without useful output, stop and report it.
- Skip verification only for docs-only changes or when blocked, and say why.

## Workflow

Update tracking after completing each task or sprint item: move the corresponding Linear issue (team **MyK9-platform**) to Done, and keep sprint docs and the debt register in sync with actual progress.

## Linear Issue and PR Workflow

Use the linked Linear issue as the execution contract. Keep Linear for active, PR-sized work; retain OpenSpec and repository plans as the detailed source of truth.

### Reading the board

The workspace is on Linear's free tier (250 **non-archived** issues) and is kept under that cap by auto-archive, so Done issues leave the active set once the archive window elapses. A default `list_issues` call sends `includeArchived: false` and therefore cannot see them. Pass `includeArchived: true` on any query that asks "has this already been filed, fixed, or rejected?" — deduplicating a finding, reconciling an audit ledger, checking closure, or resolving a `MYK9-<n>` cited in code. Without the flag an empty result means "not open", never "never existed", and re-files work that already shipped. `get_issue` by id resolves archived issues with no flag; prefer it whenever the id is known. Full rules: `docs/agents/issue-tracker.md` § Querying.

### Before editing

- Read the Linear issue, linked spec/plan, and relevant existing files; identify acceptance criteria and non-goals.
- Inspect the current implementation patterns, `git status`, and the mandatory worktree state before changing files. Preserve unrelated work.
- For UX-facing work, read `docs/INTENT.md`. For show-day, persistent-data, or authorization work, verify the established replication and RBAC paths before adding a new one.

### While editing

- Implement only the stated acceptance criteria. Do not change unrelated files, refactor opportunistically, or alter existing behavior unless the issue requires it.
- A small refactor is allowed only when necessary to meet acceptance criteria; keep it minimal and explain it in the PR.
- Follow existing architecture, naming, code style, and UI conventions. Preserve offline-first behavior and established mutation flows.
- Add or update tests for changes to logic, data flow, permissions, integrations, or user-visible behavior. For value-sensitive bugs, use assertion-first red-to-green coverage.

### Before opening a PR

- Run the narrowest useful verification for the touched files, review the diff for unrelated changes, and report any known unrelated broad-check failure plainly alongside targeted passing checks.
- Ensure the PR description follows the repository pull-request template when one exists and includes: what and why, Linear issue, checked acceptance criteria, relevant visual evidence, risk, how to test, intentional non-goals, material agent involvement, and follow-up issues.
- Do not mark the Linear issue Done until its stated evidence gate is complete. Browser re-walks, OpenSpec verification, and operator/shared-system gates need recorded evidence or an explicit, owned acceptance.

### After implementation

When finished, post the implementation summary, verification results, and PR link back to the linked Linear issue. The update must include:

- What changed
- Tests and checks run
- Branch or PR link
- Risks or remaining work
- Whether the acceptance criteria passed

- When a PR merges, immediately close every linked Linear issue whose acceptance criteria and evidence gate are satisfied: move it to **Done**, attach the PR and merge commit, and add a concise completion comment with verification results. Keep any issue with unmet criteria or explicitly deferred work open, with the remaining work recorded.

### PR review standard

Review against the linked Linear issue and its acceptance criteria. Check for scope gaps, defects, data-flow regressions, unnecessary expansion, security concerns, poor abstractions, missing loading/error states, and code that will be hard to maintain. Do not suggest unrelated improvements unless they are severe.

Return findings in three groups:

1. Must fix before merge
2. Should fix soon
3. No blocking findings / safe to merge

## Small Maintenance Changes

**Docs-only tracking edits go direct to `main` by default.** For files in the `CLAUDE.md` docs-only-direct-to-`main` scope (`docs/**/*.md`, top-level tracking/reference docs, package/function READMEs):

- Commit and `git push origin main` directly — no branch, no PR, no per-session approval needed. As of 2026-06-14 the `main` rulesets grant the admin role (the owner token) `bypass_mode: always`, so the push succeeds; the PR + required-checks gates are bypassed for that identity. The restriction is convention, not enforcement, so stay strictly inside the docs-only scope.
- From the primary checkout while linked worktrees exist, prefix with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...` (the local pre-commit guard is separate from the ruleset and still applies).
- Validate with `git diff --check` plus targeted `rg` checks. Do not run app tests/typecheck for Markdown-only changes.

For skill, agent-prompt (`.claude/**`), or any other **out-of-docs-scope** small edits — these still require a PR:

- Prefer one standing maintenance worktree/branch instead of one branch per tiny change. Default branch name: `codex/maintenance-notes`.
- Batch related small edits into one commit/PR when practical.
- Do not run app tests/typecheck unless TypeScript, app code, migrations, or executable scripts changed.

## Debugging seed-data / config bugs

Before writing a migration or code fix for a "why doesn't this data flow" bug, **inventory every related table up front** with a single query pass: the role table(s), the permission/config table(s), and the join/link table(s). Writing one migration, pushing it, then discovering a second missing row in a different table is a sign you didn't survey first. For RBAC specifically: check `roles`, `permissions`, and `role_permissions` in the same query batch before writing any `INSERT`. This also means `systematic-debugging`'s full four-phase ceremony can be collapsed when the data path is obvious — go straight to Phase 1 Step 4 (gather evidence across all layers at once).

## Worktree & Merge Workflow

- When asked to merge or enable auto-merge for a PR, own the merge through completion. Re-check against current `main`, resolve/update the branch if needed, run focused verification, and keep monitoring until the PR merges or hits a real blocker. If checks fail after auto-merge is enabled, proactively inspect logs, fix actionable failures, verify locally, push, and re-check. Stop for user input only when the failure is unrelated to the PR, risky/destructive to fix, or requires a product decision.
- ALWAYS run `gh pr merge` from the main repo directory, NEVER from inside a feature worktree (causes stale worktree + cwd lockup).
- Before reporting a branch as having unpushed work, run `gh pr list --state merged --head <branch>` AND grep merged PR titles for the branch's commit messages. Only flag as truly unpushed if both checks return empty.
- After a PR merge, immediately do the branch hygiene for that PR while the branch name is still known:
  1. Switch to the main repo directory and sync `main` with `git checkout main && git pull --ff-only`.
  2. Run `git fetch --prune` to drop remote-tracking refs for auto-deleted PR branches.
  3. Delete the local feature branch. For squash merges, first confirm `gh pr list --state merged --head <branch>` returns the merged PR, then use `git branch -D <branch>` because `git branch -d` may not recognize rewritten squash history.
  4. If the branch had a worktree, remove the worktree after branch cleanup. Do worktree removal as the final cleanup command if the current shell is inside that worktree.
- Branches named `pr-###`, scratch branches, or temporary review branches should be deleted immediately after the corresponding PR/review work is merged or abandoned. Do not leave them for weekly cleanup unless they are explicitly marked as active.
- Defer worktree removal to the FINAL step of cleanup, after all other commands have run, to avoid orphaning the shell cwd.

## Database Migrations

- Before writing a migration that references existing rows (e.g., permissions), QUERY the target table first to confirm referenced values exist.
- Run migration commands from the worktree linked to Supabase, not the main repo.

## Auto Mode — shared-system writes

When Auto Mode is active, the "execute immediately" guidance does NOT extend to mutations of shared systems. Before running any of the following, pause and confirm even if the user's initial request implied consent:

- `supabase db push` on a linked project (writes to staging/prod DB)
- `supabase functions deploy`
- `git push --force` to any branch, or any push to `main` when on a feature branch
- Creating/closing PRs, issues, or comments on GitHub
- Posting to Slack, email, or any external service

Adding rows to a shared DB is not "destructive" but is still shared-system mutation. One up-front confirmation covers a sequence of related pushes in the same session; re-confirm when switching to a new system or operation type.
