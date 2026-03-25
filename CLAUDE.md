# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Git Operations

When asked to pull from GitHub or sync, always do `git fetch` then `git pull` before any other analysis or review work.

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
pnpm clean            # Clean all build artifacts

# Testing (run from app directories)
cd apps/myk9q && pnpm test        # myK9Q unit tests (vitest)
cd apps/myk9show && pnpm test     # myK9Show unit tests (vitest)
cd apps/myk9q && pnpm test:e2e    # myK9Q E2E tests (playwright)
cd apps/myk9show && pnpm test:e2e # myK9Show E2E tests (playwright)

# Run a single test file
cd apps/myk9show && npx vitest run src/path/to/file.test.ts
# Run tests matching a name pattern
cd apps/myk9show && npx vitest run -t "pattern"
# Run with coverage
cd apps/myk9show && pnpm test:coverage
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

## Deployment

- **myK9Show staging:** myk9-platform-myk9show.vercel.app (auto-deploys from `main`)
- **myK9Q staging:** myk9-platform-myk9q.vercel.app (auto-deploys from `main`)
- **Legacy production:** myk9q.com (separate repo, untouched)

## Stripe Integration

- **Client:** `apps/myk9show/src/services/stripe.ts` — uses `supabase.functions.invoke()` for all Stripe calls
- **Edge Functions:** `supabase/functions/stripe-checkout`, `stripe-customer-portal`, `stripe-upgrade-subscription`
- **Pattern:** Frontend calls Supabase Edge Function → Edge Function calls Stripe API with `STRIPE_SECRET_KEY`
- **Status:** Test mode (needs test products/prices + `sk_test_*` key for full testing)

## Environment Variables

Both apps use `VITE_` prefix (Vite convention). Copy `.env.example` → `.env` in each app directory.

**Required (both apps):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**myK9Show additional:** `VITE_APP_VERSION`, `VITE_APP_ENVIRONMENT`, `VITE_LOG_ENDPOINT`, `VITE_VAPID_PUBLIC_KEY`, `VITE_ENABLE_DEV_TOOLS`, `VITE_ENABLE_DEBUG_LOGS`

**myK9Q additional:** `VITE_ENVIRONMENT`, `ANTHROPIC_API_KEY` (optional, for Rules Assistant)

## Routing Architecture (myK9Show)

Routes are organized by role in `src/routes/`:

- `adminRoutes.tsx` — SITE_ADMIN routes
- `secretaryRoutes.tsx` — SECRETARY + SITE_ADMIN
- `judgeRoutes.tsx` — JUDGE + SECRETARY + SITE_ADMIN (sidebar vs. scoring split)
- `clubAdminRoutes.tsx` — CLUB_ADMIN + SITE_ADMIN
- `publicRoutes.tsx` — Anonymous + authenticated-but-unprivileged

All routes use `React.lazy()` with `<SuspenseWrapper>` + `<PageTransition>`. Route preloading priorities defined in `src/routes/routeRegistry.ts` (critical/high/medium/low). Protected routes wrapped with `<ProtectedRoute>` which checks role permissions.

## Authentication & RBAC

**myK9Show** uses database-driven RBAC via `AuthContext` (`src/context/AuthContext.tsx`):

- **Roles** (`UserRole` enum in `src/types/auth-types.ts`): `SITE_ADMIN`, `SECRETARY`, `JUDGE`, `CLUB_ADMIN`, `CHAIRMAN`, `STEWARD`, `EXHIBITOR`
- **Hierarchy** (highest privilege first): site_admin → secretary → judge → club_admin → chairman → steward → exhibitor
- **Permissions**: Database-driven via `RBACService`, scoped to show/trial/class level (`scope_type` + `scope_id`)
- **Convenience flags**: `isAdmin`, `isSecretary`, `isExhibitor`, `isJudge`
- **Key methods**: `hasRole(role)`, `hasPermission(permission, scope?)`, `getUserRoles()`, `checkPermissionAsync(permission, scope?)`

**myK9Q** uses passcode-based auth: `[role][4-digits]` (e.g., `aa260`). Roles: `a` (admin), `j` (judge), `s` (steward), `e` (exhibitor). Validated via Supabase Edge Function.

## Form Handling (myK9Show)

Uses custom `OptimisticForm` component (`src/components/forms/OptimisticForm.tsx`) — not React Hook Form:

```typescript
<OptimisticForm
  entityType="dog" entityId={id} initialData={dog}
  onSave={saveFn} onValidate={zodValidator}
  autoSave autoSaveDelay={2000}
>
  {({ data, updateField, isDirty, isProcessing, errors }) => (
    // render form fields
  )}
</OptimisticForm>
```

- **Pattern**: Render props with `updateField`/`updateFields`
- **Auto-save**: Debounced (default 2s), validates before saving
- **Validation**: Zod schemas passed via `onValidate`, returns `string[]` errors

## Error Handling (myK9Show)

**ErrorBoundary** (`src/components/common/ErrorBoundary.tsx`):

- `level` prop: `'page' | 'section' | 'component'` — controls fallback UI
- Auto-classifies errors via `ErrorClassificationService`
- Max 3 retries, logs to `LoggingService`

**Toast notifications** via Sonner (`src/lib/notifications.tsx`):

```typescript
import { notifications, actionNotifications } from '@/lib/notifications';
notifications.success('Saved');
notifications.error('Failed to save');
actionNotifications.created('Dog', dog.name); // "Dog 'Rex' created"
actionNotifications.deleted('Entry', null, onUndo); // with undo action
```

## Key Patterns

### Offline-first data (myK9Q)

Always use replicated tables — never bypass with direct Supabase calls (breaks offline):

```typescript
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

## State Management

### When to Use What

| Tool                  | Use For                                  | Examples                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| **Zustand**           | Client/UI state shared across components | Modals, filters, selections, domain stores |
| **React Query**       | Server state, async data fetching        | Lists, detail views, search results        |
| **React Context**     | Cross-cutting concerns (rarely changes)  | Auth/RBAC, theme, app-wide config          |
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, scores (myK9Q)   |
| **Local `useState`**  | Ephemeral, component-scoped state        | Form inputs, timers, dialog open/close     |

### Zustand Store Conventions

- **Location:** `src/store/` (myK9Show) or `src/stores/` (myK9Q)
- **Naming:** `use<Domain>Store` (e.g., `useShowStore`, `useScoringStore`)
- **Actions as async:** Return `Promise` for operations that touch the database
- **Optimistic updates:** Update Zustand state immediately, let replication sync in background
- **myK9Q stores** use `devtools` + `persist` middleware (Zustand handles persistence)
- **myK9Show stores** are plain Zustand (persistence handled by `@myk9/replication`)
- **Shared stores** (`@myk9/scoring`) expose a factory + default instance:
  ```typescript
  export function createScoringStore(enableDevtools = false) {
    /* ... */
  }
  export const useScoringStore = createScoringStore();
  ```

### React Query Conventions (myK9Show)

- **Query keys:** Use factories from `src/lib/queryClient.ts` (`queryKeys.dogs`, `queryKeys.dog(id)`)
- **Cache strategies:** Apply predefined configs — `cacheStrategies.static` (30min), `.moderate` (5min), `.dynamic` (1min), `.realtime` (30s)
- **Mutations:** Optimistic cache update in `onSuccess`, then invalidate related queries
- **Query hooks:** Located in `src/hooks/queries/`

### Anti-Patterns

- Don't use `useState` for server data that should be cached (use React Query)
- Don't add new Context providers for domain data (use Zustand stores)
- Don't duplicate stores across apps — extract to a shared package

## Refactoring Guidelines

When refactoring files into modules, verify all imports/exports are correct and no unused imports remain before considering the task complete.

### Post-Refactoring Checklist

After any file refactoring or extraction, run this checklist before reporting completion:

1. `pnpm typecheck` passes with zero errors
2. No stale imports reference the old file (search for `from.*old-filename` across `src/`)
3. No unused imports or variables remain in modified files
4. All extracted modules have proper TypeScript types (no `any`)

## Testing

Always ensure generated test code compiles cleanly: no `await` outside `async`, no unused variables (remove them, don't underscore-prefix), and run the test suite before considering work complete.

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

### Test Utilities (myK9Show)

**Custom render** (`src/test/utils/testUtils.tsx`): Wraps components with QueryClientProvider (no retries), AuthProvider, and MemoryRouter. Always use this instead of raw `render`:

```typescript
import { render, userEvent } from '@/test/utils/testUtils';
const { user } = render(<MyComponent />, { initialRoute: '/shows/123' });
await user.click(screen.getByRole('button'));
```

**Helpers**: `waitForLoadingToFinish()` (waits for `aria-busy`, `data-testid="loading"`, `.animate-pulse` to clear), `mockZustandStore(initialState)`, `createMockResponse(data, delay?)`, `expectAsyncError(fn, message?)`

### Test Setup

Global setup (`src/test/setup.ts`) auto-mocks: Supabase client (chainable queries), IndexedDB (`fake-indexeddb`), localStorage, `window.matchMedia`, `IntersectionObserver`, `ResizeObserver`, and suppresses console output. Vitest globals enabled — no need to import `describe`/`it`/`expect`.

## Workflow

Update plan/tracking documents (TO-DOS.md, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.
