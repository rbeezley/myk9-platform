# CLAUDE.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Intent & Emotional Design

**Before making UX-facing changes, read [`docs/INTENT.md`](docs/INTENT.md).** It defines the emotional intent behind each role's experience. Every optimization, refactoring, or "improvement" to user-facing code should preserve the target feeling for that role. If code has an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

## Current development phase — consolidate, don't duplicate

The project is **pre-launch with no real users yet** (both monorepo apps). The current phase is focused on **simplifying and consolidating** — making a smooth, intuitive, logical workflow across the app. We are **not** in a phase of building new isolated features or adding more surface area.

This shapes every UX decision. Before proposing a new page, sheet, dialog, or affordance:

1. **Search for the existing surface first.** If a feature looks like it duplicates an existing page (e.g., "approve entries" exists on both the workbench *and* the Entries Management page), that is a smell. Add a *link* between the surfaces; do not reimplement.
2. **A fast path is not always new UI.** If the user needs a quicker way to do something that exists on page B, the answer is often a deep-link from page A to page B with filters pre-applied — not a re-implementation on page A.
3. **One concern, one page.** When in doubt about whether work belongs on page A or page B, ask. Don't guess by adding both. The workbench-collapse plan ([`docs/plan-show-map-workbench-collapse.md`](docs/plan-show-map-workbench-collapse.md)) is the precedent: it deleted Today + Wrap-up tabs not because they were wrong, but because their concerns belonged in fewer places.
4. **State the duplication question explicitly when proposing a feature.** Before building, answer: *"Does this duplicate an existing page? If so, why is duplication justified instead of a link?"* If the answer is "yes, no strong justification," narrow scope before writing code.
5. **Deletions are a feature.** Removing a redundant surface is as valuable as adding a missing one — often more so at this phase. If you find yourself building something that overlaps an existing page, propose deleting the overlap.

The mental model: the user's experience is a single coherent workflow, not a menu of independent screens. Every new affordance either tightens that workflow or fragments it. Default to tightening.

## Development Principles

1. **Don't guess or assume** — Verify facts, check actual code, ask if uncertain
2. **Follow DRY principles** — Don't Repeat Yourself. Create reusable components if possible
3. **Follow SLC** — Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete)
4. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules
5. **Protect intent** — When code looks "wrong" but has an `// INTENT:` comment, it's deliberate. When making UX changes, check if they preserve the role's target feeling (see `docs/INTENT.md`)

## Worktrees

Git worktrees share history but **not** gitignored files (`node_modules/`, `.env`, `dist/`). A `PostToolUse` hook runs `scripts/bootstrap-worktree.sh` automatically after `EnterWorktree`. If something is missing, run it manually:

```bash
bash scripts/bootstrap-worktree.sh   # installs deps, copies .env, builds packages
```

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

### Offline-first data (myK9Q)

Always use replicated tables — never bypass with direct Supabase calls (breaks offline):

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
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, scores (myK9Q)   |
| **Local `useState`**  | Ephemeral, component-scoped state        | Form inputs, timers, dialog open/close     |

## Testing

Always ensure generated test code compiles cleanly: no `await` outside `async`, no unused variables (remove them, don't underscore-prefix), and run the test suite before considering work complete.

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

Use the custom render from `src/test/utils/testUtils.tsx` instead of raw `render` — it wraps with QueryClient, Auth, and Router providers.

**Assertion-first for value-sensitive bugs.** When a bug involves a specific value going to a specific place (enum string to a DB column, key in a response object, header in an HTTP call), write the `expect(...).toHaveBeenCalledWith(...)` line first and run it red before touching the implementation. A failing test proves the current wrong value; the fix then flips it green. This catches silent overwrites that visual inspection and typechecking miss.

## Workflow

Update plan/tracking documents (`OPEN-TODOS.md`, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.

### Codex second opinion (optional)

For high-stakes diffs — RLS, migrations, payment flows, auth, RBAC seed data — run `/codex:review` alongside the standard `/review` to get a non-Claude model's read. The value is independent failure modes: Codex (GPT-5) often catches issues both Claude reviewers miss for the same reason, and vice versa. Skip on docs and trivial fixes. The review gate is intentionally OFF — opt in per PR, don't gate every stop.

## Debugging seed-data / config bugs

Before writing a migration or code fix for a "why doesn't this data flow" bug, **inventory every related table up front** with a single query pass: the role table(s), the permission/config table(s), and the join/link table(s). Writing one migration, pushing it, then discovering a second missing row in a different table is a sign you didn't survey first. For RBAC specifically: check `roles`, `permissions`, and `role_permissions` in the same query batch before writing any `INSERT`. This also means `systematic-debugging`'s full four-phase ceremony can be collapsed when the data path is obvious — go straight to Phase 1 Step 4 (gather evidence across all layers at once).

## Worktree & Merge Workflow

- **Work in a worktree, never the primary checkout, whenever concurrent agents may be active.** This is enforced: `.githooks/pre-commit` blocks a commit from the primary working tree while any linked worktree exists (the classic `git add -A` sweep that clobbers a co-resident agent's WIP). `scripts/bootstrap-worktree.sh` activates the hook by pointing `core.hooksPath` at `.githooks` (it handles this repo's `extensions.worktreeConfig`, where a per-worktree override would otherwise shadow a plain `core.hooksPath` set — see `.githooks/README.md`). The hook is invisible to compliant worktree commits and to solo work with no worktrees. Bypass once for the docs-only-direct-to-`main` flow with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...`.
- ALWAYS run `gh pr merge` from the main repo directory, NEVER from inside a feature worktree (causes stale worktree + cwd lockup).
- Before reporting a branch as having unpushed work, run `gh pr list --state merged --head <branch>` AND grep merged PR titles for the branch's commit messages. Only flag as truly unpushed if both checks return empty.
- After a PR merge, immediately do the branch hygiene for that PR while the branch name is still known:
  1. Switch to the main repo directory and sync `main` with `git checkout main && git pull --ff-only`.
  2. Run `git fetch --prune` to drop remote-tracking refs for auto-deleted PR branches.
  3. Verify whether the local feature branch survived: `git branch --list <branch>`. On recent `gh` versions, `gh pr merge --delete-branch` deletes BOTH the remote and the local branch — observed 2026-05-24. If the local branch still exists (older gh, manual merge, or branch was created independently of the PR flow), confirm the squash-merge via `gh pr list --state merged --head <branch>` and delete with `git branch -D <branch>` (not `-d` — squash rewrites SHAs, so `-d` may refuse).
  4. If the branch had a worktree, remove the worktree after branch cleanup. Do worktree removal as the final cleanup command if the current shell is inside that worktree.
- Branches named `pr-###`, scratch branches, or temporary review branches should be deleted immediately after the corresponding PR/review work is merged or abandoned. Do not leave them for weekly cleanup unless they are explicitly marked as active.
- Defer worktree removal to the FINAL step of cleanup, after all other commands have run, to avoid orphaning the shell cwd.
- **Bash matcher caveat:** Permission rules like `Bash(git branch:*)` gate on the literal start of the command. A compound `cd "..." && git branch -D ...` does NOT match — the rule sees `cd`, not `git branch`. The harness already persists working directory between bash calls, so drop the `cd` prefix entirely and invoke `git branch -D ...` directly. Observed 2026-05-24 during stale-branch cleanup — three denials in a row before the pattern surfaced.
- **Before directing destructive history rewrites** (`git reset --hard`, interactive rebase drops, force-push that rewrites branch tip), check whether the agent has uncommitted edits in the working tree. Those edits travel across `git checkout` and get wiped by `reset --hard`. Commit or stash them first.

## Database Migrations

- Before writing a migration that references existing rows (e.g., permissions), QUERY the target table first to confirm referenced values exist.
- Run migration commands from the worktree linked to Supabase, not the main repo.
- **Every `CREATE TABLE public.<name>` must include explicit `GRANT`s** to `anon` / `authenticated` / `service_role` as appropriate. As of Oct 30, 2026 Supabase no longer auto-exposes new `public` tables to the Data API (PostgREST / GraphQL / `supabase-js`); without a grant the table will silently 404 from the client. Template:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
  GRANT SELECT ON public.<table> TO anon;  -- only if anon should read
  ```
  Match the access level the table actually needs — never blanket-grant write to `anon`. Grants are orthogonal to RLS; both are still required.

## Auto Mode — shared-system writes

When Auto Mode is active, the "execute immediately" guidance does NOT extend to mutations of shared systems. Before running any of the following, pause and confirm even if the user's initial request implied consent:

- `supabase db push` on a linked project (writes to staging/prod DB)
- `supabase functions deploy`
- `git push --force` to any branch, or any push to `main` when on a feature branch
- Creating/closing PRs, issues, or comments on GitHub
- Posting to Slack, email, or any external service

Adding rows to a shared DB is not "destructive" but is still shared-system mutation. One up-front confirmation covers a sequence of related pushes in the same session; re-confirm when switching to a new system or operation type.

**Exception — docs-only changes may go direct to `main`.** When a commit touches *only* documentation files, skip the PR ceremony: commit on `main` (or fast-forward a feature commit into `main`) and push directly. No confirmation needed beyond the user's request to commit/push. **In scope:**

- `docs/**/*.md` (including `docs/plans/`, `docs/superpowers/`, `docs/ux-audits/`, etc.)
- `apps/*/docs/**/*.md`
- Top-level tracking/reference docs: `OPEN-TODOS.md`, `TO-DOS.md`, `README.md`, `CONTEXT.md`, `DESIGN.md`, `PRODUCT.md`, `TECHNICAL_DEBT.md`, `DEFERRED-WORK.md`, `INTENT.md` (additions/clarifications only — substantive intent changes still PR)
- `packages/*/README.md`, `supabase/functions/*/README.md` (reference docs, not deployment configs)

**Out of scope — still requires a PR:**

- `CLAUDE.md`, `AGENTS.md` (load-bearing project instructions)
- `.claude/**`, `.github/**` (settings, hooks, workflows)
- Any commit that *also* touches non-doc files — mixed commits go through PR
- Deletions or rewrites of plans authored by others, even if the file is in scope

Verify the commit's filelist matches the scope before pushing. If anything outside the in-scope list is staged, open a PR instead.
