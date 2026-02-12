# CLAUDE.md

Project guidance for Claude Code when working with the myK9 Platform monorepo.

## Project Overview

This is a TypeScript monorepo. Always use TypeScript (not JavaScript). When fixing types, verify property names match the actual schema/interface definitions — do not guess.

## Development Principles

1. **Best practices by default** - Follow established patterns, conventions, and standards
2. **Deviate only with reason** - If suggesting something non-standard, explain why
3. **Long-term maintainability first** - Favor clarity, consistency, and future-proofing over clever shortcuts
4. **Don't guess or assume** - Verify facts, check actual code, ask if uncertain.
5. **Follow DRY principles** - Dont', Repeat, Yourself. Create reusable components if possible.
6. **Follow SLC** - Simple, Lovable, Complete. Avoid feature bloat (Simple). Prioritize UX polish, error states, and "delight" (Lovable). Deliver end-to-end functionality with zero placeholders or TODOs (Complete).

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

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager | pnpm | Better monorepo support, faster, disk-efficient |
| Build orchestration | Turborepo | Caching, parallel builds, industry standard |
| UI library (myK9Show) | Base UI via shadcn/ui | Actively maintained (Radix stagnated after WorkOS acquisition) |
| UI library (myK9Q) | Semantic CSS | Keep existing production code unchanged |
| CSS framework (myK9Show) | Tailwind CSS | Industry standard, good maintainability |
| Database | Supabase (myk9-platform) | Unified project for both apps |

## Database Configuration

**Unified Supabase Project:** `myk9-platform`
- Project URL: `https://sojmvhhwsjxmfistvzbe.supabase.co`
- 56 tables with RLS enabled
- 124 RLS policies

**Supabase CLI:**
```bash
# Link to project (requires database password)
cd myk9-platform
supabase link --project-ref sojmvhhwsjxmfistvzbe

# Apply new migrations
supabase db push

# List migrations
supabase migration list
```

**MCP Server:** Configured globally in `~/.claude/settings.json` for database queries.

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
│   └── migrations/      # Database migrations (001-006)
└── docs/
    ├── MIGRATION-PLAN.md
    └── SCHEMA-ANALYSIS.md
```

## Package Naming

- Namespace: `@myk9/*`
- Apps: `@myk9/show`, `@myk9/q`
- Packages: `@myk9/core`, `@myk9/replication`, `@myk9/supabase`, `@myk9/ui`, `@myk9/scoring`, `@myk9/scoring-ui`

## Key Patterns

### Importing from workspace packages
```typescript
import { logger } from '@myk9/core';
import { ReplicatedTable } from '@myk9/replication';
import { Button } from '@myk9/ui';
import { useScoringStore, QualifyingResult } from '@myk9/scoring';
```

### Offline-first data (from myK9Q)
```typescript
// Always use replicated tables for data operations
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

### Scoring stores (from @myk9/scoring)
```typescript
import { useScoringStore, useTimerStore } from '@myk9/scoring';

// Scoring session management
const { startSession, submitScore, syncStatus } = useScoringStore();

// Multi-area timer for scent work
const { startTimer, stopTimer, getAreaTime } = useTimerStore();
```

### Scoring UI hooks (from @myk9/scoring-ui)
```typescript
import { useStopwatch, useEntryListFilters, useDragAndDropEntries } from '@myk9/scoring-ui';

// Timer with auto-stop and warnings
const stopwatch = useStopwatch({
  maxTime: "3:00",
  level: "Novice",
  onTimeExpired: (time) => saveTime(time),
});

// Entry list filtering and sorting
const { filteredEntries, sortBy, setSortBy } = useEntryListFilters({
  entries,
  prioritizeInRing: true,
});

// Drag-and-drop reordering
const { sensors, handleDragStart, handleDragEnd } = useDragAndDropEntries({
  localEntries,
  setLocalEntries,
  currentEntries,
  onUpdateOrder: async (entries) => await saveOrder(entries),
});
```

## State Management

### When to Use What

| Tool | Use For | Examples |
|------|---------|---------|
| **Zustand** | Client/UI state shared across components | Modals, filters, selections, domain stores |
| **React Query** | Server state, async data fetching | Lists, detail views, search results |
| **React Context** | Cross-cutting concerns (rarely changes) | Auth/RBAC, theme, app-wide config |
| **@myk9/replication** | Persistent data that must work offline | Show data, class entries, scores (myK9Q) |
| **Local `useState`** | Ephemeral, component-scoped state | Form inputs, timers, dialog open/close |

### Zustand Store Conventions

- **Location:** `src/store/` (myK9Show) or `src/stores/` (myK9Q)
- **Naming:** `use<Domain>Store` (e.g., `useShowStore`, `useScoringStore`)
- **Actions as async:** Return `Promise` for operations that touch the database
- **Optimistic updates:** Update Zustand state immediately, let replication sync in background
- **myK9Q stores** use `devtools` + `persist` middleware (Zustand handles persistence)
- **myK9Show stores** are plain Zustand (persistence handled by `@myk9/replication`)
- **Shared stores** (`@myk9/scoring`) expose a factory + default instance:
  ```typescript
  export function createScoringStore(enableDevtools = false) { /* ... */ }
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

## Migration Status

See [docs/MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md) for detailed implementation plan.

- [x] Phase 0: Foundation & Tooling
- [x] Phase 1: Shared Packages Foundation (@myk9/core, @myk9/supabase, @myk9/replication)
- [x] Phase 2: Migrate myK9Show to Monorepo
- [x] Phase 3: Shared UI Components
- [x] Phase 4: Migrate myK9Q to Monorepo
- [x] Phase 5: Database Consolidation (schema applied, data migration pending)
- [x] Phase 6: Scoring Package
- [~] Phase 7: Testing & Validation (in progress)
- [ ] Phase 8: Deployment & Cleanup

## Test Coverage

| App | Unit Tests | E2E Tests |
|-----|------------|-----------|
| myK9Q | 1901 tests (99.7% passing) | Playwright |
| myK9Show | Vitest suite | Playwright |

## Git Workflow

After every commit, always push to GitHub unless explicitly told not to. Never leave commits unpushed without asking.

## Quality Checks

Always run typecheck (`pnpm typecheck`) and lint (`pnpm lint`) before committing. If errors are found, fix them before proceeding with the commit.

## Refactoring Guidelines

When refactoring files into modules, verify all imports/exports are correct and no unused imports remain before considering the task complete.

## Testing

When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems.

## Workflow

Update plan/tracking documents (TO-DOS.md, sprint docs, debt register) after completing each task or sprint item. Keep them in sync with actual progress.

## Related Projects

- **myK9Q (production):** `D:/AI-Projects/myK9Qv3` - Production scoring app (separate repo)
- **myK9Show (original):** `D:/AI-Projects/myK9Show-Windsurf` - Reference only
