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
pnpm dev:show         # Run myK9Show dev server
pnpm dev:q            # Run myK9Q dev server
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check across monorepo
pnpm lint             # ESLint across monorepo
pnpm test             # Run tests
pnpm clean            # Clean all build artifacts
```

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager | pnpm | Better monorepo support, faster, disk-efficient |
| Build orchestration | Turborepo | Caching, parallel builds, industry standard |
| UI library (myK9Show) | Base UI via shadcn/ui | Actively maintained (Radix stagnated after WorkOS acquisition) |
| UI library (myK9Q) | Semantic CSS | Keep existing production code unchanged |
| CSS framework (myK9Show) | Tailwind CSS | Industry standard, good maintainability |
| Database | Supabase | Already in use, PostgreSQL + real-time |

## Monorepo Structure

```
myk9-platform/
├── apps/
│   ├── myk9show/        # @myk9/show - Full show management
│   └── myk9q/           # @myk9/q - Lightweight scoring (Phase 4)
├── packages/
│   ├── core/            # @myk9/core - Utilities, types, constants
│   ├── replication/     # @myk9/replication - Offline-first sync
│   ├── supabase/        # @myk9/supabase - Client and types
│   ├── ui/              # @myk9/ui - Shared UI components
│   └── scoring/         # @myk9/scoring - Scoring logic
└── docs/
```

## Package Naming

- Namespace: `@myk9/*`
- Apps: `@myk9/show`, `@myk9/q`
- Packages: `@myk9/core`, `@myk9/replication`, `@myk9/supabase`, `@myk9/ui`, `@myk9/scoring`

## Key Patterns

### Importing from workspace packages
```typescript
import { logger } from '@myk9/core';
import { ReplicatedTable } from '@myk9/replication';
import { Button } from '@myk9/ui';
```

### Offline-first data (from myK9Q)
```typescript
// Always use replicated tables for data operations
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

## Migration Status

See [docs/MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md) for detailed implementation plan.

- [x] Phase 0: Foundation & Tooling
- [ ] Phase 1: Shared Packages Foundation (@myk9/core, @myk9/supabase, @myk9/replication)
- [ ] Phase 2: Migrate myK9Show to Monorepo
- [ ] Phase 3: Shared UI Components
- [ ] Phase 4: Migrate myK9Q to Monorepo
- [ ] Phase 5: Database Consolidation
- [ ] Phase 6: Scoring Package
- [ ] Phase 7: Testing & Validation
- [ ] Phase 8: Deployment & Cleanup

## Related Projects

- **myK9Q (original):** `D:/AI-Projects/myK9Qv3` - Production scoring app, do not modify until Phase 4
- **myK9Show (original):** `D:/AI-Projects/myK9Show-Windsurf` - Reference for migration, has blockers
