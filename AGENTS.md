# AGENTS.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Product Goal

Default long-term goal: make myK9 launch-ready for fall 2026, with secretary/show-day reliability as the highest priority. Use [`docs/goals/fall-2026-launch-readiness.md`](docs/goals/fall-2026-launch-readiness.md) as the prioritization frame when choosing and executing backlog work.

## Intent & Emotional Design

**Before making UX-facing changes, read [`docs/INTENT.md`](docs/INTENT.md).** It defines the emotional intent behind each role's experience. Every optimization, refactoring, or "improvement" to user-facing code should preserve the target feeling for that role. If code has an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

## Development Principles

1. **Don't guess or assume** — Verify facts, check actual code, ask if uncertain
2. **Follow DRY principles** — Don't Repeat Yourself. Create reusable components if possible
3. **Follow SLC** — Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete)
4. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules
5. **Protect intent** — When code looks "wrong" but has an `// INTENT:` comment, it's deliberate. When making UX changes, check if they preserve the role's target feeling (see `docs/INTENT.md`)

## Worktrees

Git worktrees share history but **not** gitignored files (`node_modules/`, `.env`, `dist/`). A `PostToolUse` hook runs `scripts/bootstrap-worktree.sh` automatically after `EnterWorktree`. If something is missing, run it manually:

```bash
bash scripts/bootstrap-worktree.sh   # installs deps, copies .env, builds packages, activates git hooks
```

**Work in a worktree, never the primary checkout, when other agents may be active.** This repo is regularly worked by concurrent agents (Codex + Claude); committing from the primary tree — especially `git add -A` — sweeps another agent's untracked WIP. This is enforced: `.githooks/pre-commit` blocks a commit from the primary working tree while any linked worktree exists (bootstrap activates it by repointing `core.hooksPath` at `.githooks`, handling this repo's `extensions.worktreeConfig` overrides — see `.githooks/README.md`). Compliant worktree commits and solo no-worktree work are unaffected. Bypass the documented docs-only-direct-to-`main` flow with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...`.

## Planning

When creating implementation or remediation plans, always save them to a markdown file (e.g., `PLAN.md` or `docs/plan-<topic>.md`) rather than only outputting to chat. Follow existing plans when they exist — do not start from scratch. **Every plan must include a testing phase** — unit tests for new components, hooks, and utilities. Do not consider a phase complete until its tests are written and passing.

## Commands

```bash
# Package manager: pnpm (not npm)
pnpm install          # Install all dependencies
pnpm dev:show         # Run myK9Show dev server (localhost:5173)
pnpm dev:q            # Run myK9Q dev server
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check across monorepo
pnpm lint             # ESLint across monorepo

# Testing (run from app directories)
cd apps/myk9q && pnpm test        # myK9Q unit tests (vitest)
cd apps/myk9show && pnpm test     # myK9Show unit tests (vitest)
cd apps/myk9q && pnpm test:e2e    # myK9Q E2E tests (playwright)
cd apps/myk9show && pnpm test:e2e # myK9Show E2E tests (playwright)

# Run a single test file
cd apps/myk9show && npx vitest run src/path/to/file.test.ts
# Run tests matching a name pattern
cd apps/myk9show && npx vitest run -t "pattern"
```

## Architecture Decisions

- **UI library (myK9Show):** Base UI via shadcn/ui — NOT Radix (Radix stagnated after WorkOS acquisition)
- **UI library (myK9Q):** Semantic CSS — do not add Tailwind to myK9Q
- **Database:** Unified Supabase project (`myk9-platform`) for both apps
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
- **myK9Q staging:** myk9-platform-myk9q.vercel.app (auto-deploys from `main`)
- **Legacy production:** myk9q.com (separate repo, untouched)

## Key Patterns

### Offline-first data (both apps)

Both myK9Show and myK9Q are offline-first. Always use replicated tables / replication-backed query functions for persistent app data that must work offline — never bypass with direct Supabase reads in core flows (breaks offline):

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
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, scores (both apps) |
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

Update plan/tracking documents (`OPEN-TODOS.md`, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.

## Debugging seed-data / config bugs

Before writing a migration or code fix for a "why doesn't this data flow" bug, **inventory every related table up front** with a single query pass: the role table(s), the permission/config table(s), and the join/link table(s). Writing one migration, pushing it, then discovering a second missing row in a different table is a sign you didn't survey first. For RBAC specifically: check `roles`, `permissions`, and `role_permissions` in the same query batch before writing any `INSERT`. This also means `systematic-debugging`'s full four-phase ceremony can be collapsed when the data path is obvious — go straight to Phase 1 Step 4 (gather evidence across all layers at once).

## Worktree & Merge Workflow

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


<claude-mem-context>
# Memory Context

# [myk9-platform] recent context, 2026-05-30 7:05pm CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,613t read) | 422,788t work | 96% savings

### May 12, 2026
S319 Reviewed myK9 Platform's documentation-first proactive QA system and provided feedback on design and implementation (May 12 at 7:57 AM)
S320 Review implementation of QA system suggestions: validate E2E suite classification, findings registry, asset inventory, and automation scripts (May 12 at 1:21 PM)
S321 QA documentation cleanup and Codex local enforcement: Fix malformed tables, add PR smoke purpose statement, organize snapshot artifacts, remove empty headings, and wire qa:e2e-map:check validation into local Codex hooks (May 12 at 2:29 PM)
S322 Complete QA documentation cleanup: verify malformed tables fixed, PR smoke purpose added, snapshot artifacts categorized, empty headings removed, and Codex hook enforcement wired for local drift detection (May 12 at 2:34 PM)
S323 Comprehensive review of PR #177 ("UI/UX fixes for show details and class workflows") examining 2,476 additions and 1,732 deletions across 96 files in the myk9-platform show management app (May 12 at 2:34 PM)
### May 13, 2026
S324 Count lines of code in the myk9-platform project and provide language/area breakdown (May 13 at 8:07 PM)
S325 Assessment of whether myK9-platform is a "big" project and how it scales relative to industry standards (May 13 at 8:29 PM)
S326 Rate the code quality of the myk9show codebase - comprehensive assessment of TypeScript/React SaaS app at ~722k LOC (May 13 at 8:30 PM)
S327 Code review of PR #178: Promote repaired myK9Show nightly QA checks — architectural test migration from flaky Playwright wrappers to deterministic Vitest unit/service/hook coverage. (May 13 at 8:36 PM)
S328 Build a plan to raise code quality rating from 7.0 to 8.0 or higher (May 13 at 8:44 PM)
### May 30, 2026
2207 4:19p 🟣 Multi-target messaging system with ringside support
2208 " ✅ Ringside passcode persisted in grant for session RPCs
2209 " 🟣 RingsideSessionHeartbeat component for session lifecycle management
2212 " ✅ Phase 3 unification plan marked complete
2213 4:24p 🔵 PR 457 local verification completed successfully
2214 " 🔵 PR 457 refactors ReplicatedArmbandsTable to syncReplicatedTable pattern
2229 4:34p 🔵 Code review of PR #458 (ringside phase 3 presence fanout) identifies credential handling bug and coverage gaps
2230 " 🔵 Verified handleConfirmJoin credential re-read bug in SmartSignInPage
2231 " 🔵 Confirmed all_show broadcast silently excludes non-exhibitor passcode roles (steward, judge)
2232 " 🔵 RingsideSessionHeartbeat component lacks unit test coverage for lifecycle and visibility-change behavior
2233 4:35p ✅ Added RED test for handleConfirmJoin passcode snapshot bug
2234 " 🔵 RED test confirms handleConfirmJoin stores edited passcode instead of validated snapshot
2235 " 🔴 Fixed handleConfirmJoin credential snapshot bug in SmartSignInPage
2236 " 🔵 RED test now passes after handleConfirmJoin fix
2238 4:36p 🔵 RingsideSessionHeartbeat test requires complete supabase mock including auth methods
2239 " 🔵 AuthProvider initialization requires supabase.auth and @tanstack/react-query mocking in RingsideSessionHeartbeat test
2240 " 🔵 RingsideSessionHeartbeat tests now pass with complete mock infrastructure
2242 4:37p ✅ Code review findings from PR #458 addressed and documented
2244 " 🔵 All Phase 3 ringside tests passing: 20 tests across 4 files with no regressions
2246 " 🔵 TypeScript type checking passes for @myk9/show app with no errors
2247 " 🔵 Lint check passes with no new violations introduced by Phase 3 review fixes
2248 " 🔵 Phase 3 code review feedback work complete and ready for PR submission
2249 " ✅ PR #458 code review feedback commits pushed to GitHub
2250 6:23p 🔵 PR #458 ready for merge: Phase 3 Ringside presence fanout implementation
2252 6:24p 🟣 Arch Phase 2: Migration of 5 replication adapters to syncReplicatedTable()
2253 " 🔵 Vercel deployment rate limit hit on free tier
2251 " 🔵 PR #458 CI checks failing: test failures and Vercel rate limits block merge
2254 " 🔵 Test failures identified in PR #458: 3 failing tests in replication and messaging services
2255 " 🔄 Adapter pattern consolidates sync loop duplication across replication adapters
2256 6:25p 🔵 Test failure root cause: useMessageMutations hook sends incorrect edge function payload
2258 " 🔵 syncReplicatedTable orchestrates 9-step sync choreography with extensible adapter hooks
2257 " ✅ Updated useMessageMutations test with corrected API contract
2259 " 🔵 Previously failing tests now pass locally: all 3 test suites green with 116 tests passing
2262 " 🔵 Test suite failures reveal sync metadata and mock setup issues with adapter pattern
2260 " ✅ Committed test fix for targeted message API contract
2261 " ✅ Pushed test fix to PR #458 for CI re-run
2263 " 🔵 PR #458 CI re-run initiated with updated test expectations
2264 6:26p 🔵 GitHub Actions checks confirm test failures and deployment blockers
2265 " 🔵 PR #461 test failures reveal two distinct issues in replication sync logic
2267 6:59p 🔵 PR #458 CI status: Test failure blocking merge
2266 7:00p 🔴 Message mutations contract refactored to support class-targeted messaging
2268 " 🔵 PR #458 test failures: replication sync operation type mismatch
2269 " 🔵 PR #458 test rerun in progress after failed job rerun
2270 7:02p 🔵 PR #458 details: phase 3 presence fanout implementation
2271 7:03p 🔵 Worktree configuration for phase-3-unify-ringside feature branch
2272 7:04p ✅ AGENTS.md updated with memory access documentation
2274 " 🔵 Git commit safety mechanism: primary worktree commits blocked when other worktrees active
2273 " ✅ AGENTS.md updated with memory context instructions
2275 " ✅ AGENTS.md documentation committed to main branch
2276 " 🔵 AGENTS.md shows modifications after successful commit

Access 423k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
