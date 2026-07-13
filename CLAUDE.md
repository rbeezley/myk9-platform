# CLAUDE.md

## Communication Style

Keep responses concise, short, and to the point. Lead with the answer or action. Skip preamble, filler, and summaries of completed work.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

##Self Learning
When I correct you or you catch yourself making a mistake, before continuing, add the lesson as a one-line rule under #LESSONS so it never happens again.

##LESSONS

- `supabase functions deploy --workdir apps/myk9show` follows that dir's stale `.temp/project-ref` (myK9Show-Working, defunct) — ALWAYS pass `--project-ref sojmvhhwsjxmfistvzbe` explicitly and confirm the "Deployed Functions on project ..." line names the right ref.

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

**Every plan is born tagged.** Directly under the plan's `# Title`, add a status line:

```markdown
> **Status:** Active
```

Use `Active` while work is in progress or not yet started, `Complete` once the work has shipped, `Abandoned` if superseded or dropped. Then register the plan with one row in [`docs/README.md`](docs/README.md) (the living docs index). When a plan's work merges, flip its status to `Complete` and `git mv` the file into `docs/archive/` (mirror its path), then remove its row from the index. This convention is what keeps `docs/` from re-accumulating undated, indistinguishable plans — see [`docs/README.md`](docs/README.md) for the full "how docs are organized" rules. A plan without a status line is incomplete.

**OpenSpec carve-out.** When a single unit of buildable work will be implemented through the opsx skills, the OpenSpec change (`openspec/changes/<id>/` — proposal, design, specs, tasks) _is_ the plan and satisfies this requirement. Do not also author a `docs/plan-*.md` for the same work; the change's `tasks.md` is the sole execution tracker, and archiving the change closes it out. Investigate first with `opsx:explore`, then `opsx:propose` — the change artifacts still need a testing phase (the config's task rules enforce this). `docs/` plans remain the right home for: multi-change roadmaps, audits whose findings are the deliverable, and living reference material (token tables, specs) — extract reference material to its own doc or promote it to `openspec/specs/` via `opsx:sync` rather than leaving it inside an archived change. If a `docs/` plan already exists when the change is created, add `> Tracked in openspec change: <id>` under its status line so the two never track independently.

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

Always ensure generated test code compiles cleanly: no `await` outside `async`, no unused variables (remove them, don't underscore-prefix), and run the test suite before considering work complete.

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

Use the custom render from `src/test/utils/testUtils.tsx` instead of raw `render` — it wraps with QueryClient, Auth, and Router providers.

For bug-fixing methodology (assertion-first testing, seed-data/RBAC survey-first debugging, systematic-debugging vs. incident-triage) see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 3.

## Workflow

Update plan/tracking documents (`OPEN-TODOS.md`, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.

**Which review to use, and the Codex second-opinion policy: see [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) § 4.**

## Worktree & Merge Workflow — hard rules

Full mechanics: [`docs/reference/git-workflow.md`](docs/reference/git-workflow.md). The non-negotiable rules:

1. **Work in a worktree, never the primary checkout,** whenever concurrent agents may be active — `.githooks/pre-commit` enforces this. Bypass once with `MYK9_ALLOW_PRIMARY_COMMIT=1 git commit ...` only for the docs-only-direct-to-`main` flow.
2. **Never run `gh pr merge` from inside a feature worktree** — run it from the main repo directory.
3. **After a merge, verify the local branch survived** (`git branch --list <branch>`) before assuming `--delete-branch` cleaned it up — delete with `git branch -D <branch>` (not `-d`, squash rewrites SHAs) if it didn't.
4. **Worktree removal is always the final cleanup step**, after branch deletion, never before.
5. **Before a destructive history rewrite** (`reset --hard`, rebase drops, force-push), check for uncommitted edits in the working tree first — they get wiped, not carried.

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

**Exception — docs-only changes may go direct to `main`.** When a commit touches _only_ documentation files, skip the PR ceremony: commit on `main` (or fast-forward a feature commit into `main`) and push directly. No confirmation needed beyond the user's request to commit/push. `CLAUDE.md` and `.claude/**`/`.github/**` are always out of scope for this exception — they need a PR regardless of how small the change. Full in-scope/out-of-scope file list and the bypass mechanism: [`docs/reference/git-workflow.md`](docs/reference/git-workflow.md) § "Docs-only direct-to-`main`." Verify the commit's filelist matches the scope before pushing.
