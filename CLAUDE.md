# CLAUDE.md

Project guidance for Claude Code when working with the myK9 Platform monorepo.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Development Principles

1. **Best practices by default** — Follow established patterns, conventions, and standards
2. **Deviate only with reason** — If suggesting something non-standard, explain why
3. **Long-term maintainability first** — Favor clarity, consistency, and future-proofing over clever shortcuts
4. **Don't guess or assume** — Verify facts, check actual code, ask if uncertain
5. **Follow DRY principles** — Don't Repeat Yourself. Create reusable components if possible
6. **Follow SLC** — Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete)
7. **Keep files under 500 lines** — Extract types, helpers, and constants into sibling modules

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
```

## Architecture Decisions

| Decision                 | Choice                   | Rationale                                                      |
| ------------------------ | ------------------------ | -------------------------------------------------------------- |
| Package manager          | pnpm                     | Better monorepo support, faster, disk-efficient                |
| Build orchestration      | Turborepo                | Remote caching, parallel builds, industry standard             |
| UI library (myK9Show)    | Base UI via shadcn/ui    | Actively maintained (Radix stagnated after WorkOS acquisition) |
| UI library (myK9Q)       | Semantic CSS             | Keep existing production code unchanged                        |
| CSS framework (myK9Show) | Tailwind CSS             | Industry standard, good maintainability                        |
| Database                 | Supabase (myk9-platform) | Unified project for both apps                                  |
| Formatting               | Prettier                 | Auto-format hook runs on every file edit                       |

## Monorepo Structure

```
myk9-platform/
├── apps/
│   ├── myk9show/        # @myk9/show - Full show management
│   └── myk9q/           # @myk9/q - Lightweight scoring
├── packages/
│   ├── core/            # @myk9/core - Utilities, types, constants
│   ├── replication/     # @myk9/replication - Offline-first sync
│   ├── supabase/        # @myk9/supabase - Client and types
│   ├── ui/              # @myk9/ui - Shared UI components
│   ├── scoring/         # @myk9/scoring - Scoring logic and stores
│   └── scoring-ui/      # @myk9/scoring-ui - Shared scoring UI hooks
├── supabase/
│   ├── config.toml      # Supabase CLI config
│   ├── functions/       # Edge Functions (stripe-checkout, stripe-customer-portal, stripe-upgrade-subscription)
│   └── migrations/      # Database migrations (001-006)
└── docs/
    ├── MIGRATION-PLAN.md
    └── SCHEMA-ANALYSIS.md
```

## Database Configuration

**Unified Supabase Project:** `myk9-platform`

- Project URL: `https://sojmvhhwsjxmfistvzbe.supabase.co`

**Supabase CLI:**

```bash
supabase link --project-ref sojmvhhwsjxmfistvzbe  # Link (requires db password)
supabase db push                                    # Apply migrations
supabase migration list                             # List migrations
supabase functions deploy <name> --no-verify-jwt    # Deploy Edge Function
```

## Deployment

- **myK9Show staging:** myk9-platform-myk9show.vercel.app (auto-deploys from `main`)
- **myK9Q staging:** myk9-platform-myk9q.vercel.app (auto-deploys from `main`)
- **Legacy production:** myk9q.com (separate repo, untouched)
- **Edge Functions:** Deployed to Supabase with `--no-verify-jwt` (functions handle auth internally)

## Stripe Integration

- **Client:** `apps/myk9show/src/services/stripe.ts` — uses `supabase.functions.invoke()` for all Stripe calls
- **Edge Functions:** `supabase/functions/stripe-checkout`, `stripe-customer-portal`, `stripe-upgrade-subscription`
- **Pattern:** Frontend calls Supabase Edge Function → Edge Function calls Stripe API with `STRIPE_SECRET_KEY`
- **Status:** Test mode (needs test products/prices + `sk_test_*` key for full testing)

## Key Patterns

### Importing from workspace packages

```typescript
import { logger } from '@myk9/core';
import { ReplicatedTable } from '@myk9/replication';
import { Button } from '@myk9/ui';
import { useScoringStore, QualifyingResult } from '@myk9/scoring';
```

### Offline-first data (myK9Q)

```typescript
// Always use replicated tables for data operations
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

### Scoring stores (from @myk9/scoring)

```typescript
import { useScoringStore, useTimerStore } from '@myk9/scoring';
const { startSession, submitScore, syncStatus } = useScoringStore();
const { startTimer, stopTimer, getAreaTime } = useTimerStore();
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

### Context Providers (myK9Show)

4 providers — `AuthContext` (auth + RBAC), `EnhancedThemeContext`, `RegistrationContext`, `ThemeContext`. Context is for global, rarely-changing state only. Don't add new contexts for domain data — use Zustand.

### Anti-Patterns

- Don't bypass `@myk9/replication` with direct Supabase calls in myK9Q (breaks offline)
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

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

## Workflow

Update plan/tracking documents (TO-DOS.md, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.
