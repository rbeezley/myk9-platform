# CLAUDE.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

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

### Heritage / registry columns (migration 192)

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

Update plan/tracking documents (TO-DOS.md, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.

## Debugging seed-data / config bugs

Before writing a migration or code fix for a "why doesn't this data flow" bug, **inventory every related table up front** with a single query pass: the role table(s), the permission/config table(s), and the join/link table(s). Writing one migration, pushing it, then discovering a second missing row in a different table is a sign you didn't survey first. For RBAC specifically: check `roles`, `permissions`, and `role_permissions` in the same query batch before writing any `INSERT`. This also means `systematic-debugging`'s full four-phase ceremony can be collapsed when the data path is obvious — go straight to Phase 1 Step 4 (gather evidence across all layers at once).

## Worktree & Merge Workflow

- ALWAYS run `gh pr merge` from the main repo directory, NEVER from inside a feature worktree (causes stale worktree + cwd lockup).
- Before reporting a branch as having unpushed work, run `gh pr list --state merged --head <branch>` AND grep merged PR titles for the branch's commit messages. Only flag as truly unpushed if both checks return empty.
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
