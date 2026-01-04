# CLAUDE.md

Project guidance for Claude Code when working with the myK9 Platform monorepo.

## Development Principles

1. **Best practices by default** - Follow established patterns, conventions, and standards
2. **Deviate only with reason** - If suggesting something non-standard, explain why
3. **Long-term maintainability first** - Favor clarity, consistency, and future-proofing over clever shortcuts
4. **Don't guess or assume** - Verify facts, check actual code, ask if uncertain

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

## Related Projects

- **myK9Q (production):** `D:/AI-Projects/myK9Qv3` - Production scoring app (separate repo)
- **myK9Show (original):** `D:/AI-Projects/myK9Show-Windsurf` - Reference only
