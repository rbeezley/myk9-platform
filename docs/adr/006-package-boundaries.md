# ADR-006: Package Boundaries and Dependency Graph

## Status
Accepted

## Date
2026-01-02

## Context

Consolidating two apps into a monorepo required deciding what code to share, how to partition it, and what dependency relationships to allow. Poorly drawn package boundaries lead to circular dependencies, leaky abstractions, and packages that know too much about each other.

The key shared concerns identified were:
- **Utilities and types** -- Logger, network helpers, base entity types, sync metadata types
- **Database access** -- Supabase client initialization, generated database types
- **Offline replication** -- IndexedDB caching, sync, and conflict resolution
- **Scoring domain** -- Stores, types, and utilities for the scoring workflow
- **Scoring UI** -- Shared hooks for timers, entry lists, drag-and-drop (behavioral, not visual)
- **UI components** -- Accessible primitives and styled components for myK9Show

## Decision

We organized shared code into **6 packages** under the `@myk9/*` namespace, with a strict dependency graph:

```
@myk9/scoring-ui
  |-- @myk9/ui
  |-- @myk9/core

@myk9/scoring
  (no workspace dependencies -- standalone)

@myk9/ui
  (no workspace dependencies -- standalone)

@myk9/replication
  |-- @myk9/core (devDependency)
  |-- @myk9/supabase (devDependency)

@myk9/supabase
  |-- @myk9/core (devDependency)

@myk9/core
  (leaf package -- no workspace dependencies)
```

**Package responsibilities:**

| Package | Responsibility | Key Exports |
|---------|---------------|-------------|
| `@myk9/core` | Utilities, types, constants shared by everything | `logger`, `BaseEntity`, `SyncableEntity`, network utilities |
| `@myk9/supabase` | Supabase client singleton, generated database types | `supabase` client, `Database` type, query helpers |
| `@myk9/replication` | Offline-first data layer with IndexedDB | `ReplicatedTable`, `replicatedClassesTable`, sync utilities |
| `@myk9/ui` | Accessible UI components (Base UI + Tailwind) | `Button`, `Dialog`, `Select`, tailwind preset |
| `@myk9/scoring` | Scoring domain stores and types | `useScoringStore`, `useTimerStore`, score types |
| `@myk9/scoring-ui` | Shared behavioral hooks for scoring UIs | `useStopwatch`, `useEntryListFilters`, `useDragAndDropEntries` |

**Boundary rules:**
1. `@myk9/core` is a leaf -- it depends on nothing in the workspace
2. `@myk9/supabase` depends only on `@myk9/core`
3. `@myk9/replication` depends on `@myk9/core` and `@myk9/supabase`
4. `@myk9/ui` is standalone -- no workspace dependencies (only external: Base UI, Tailwind utilities)
5. `@myk9/scoring` is standalone -- depends only on Zustand (no workspace deps)
6. `@myk9/scoring-ui` depends on `@myk9/core` and `@myk9/ui` for shared hooks
7. Apps (`@myk9/show`, `@myk9/q`) can depend on any package but packages never depend on apps

## Consequences

### Positive
- Clear dependency direction prevents circular imports -- the graph is a DAG
- `@myk9/core` as a leaf means utilities are always available without pulling in heavy dependencies
- `@myk9/scoring` being standalone means scoring logic can be tested without Supabase or UI dependencies
- Each package has a single, well-defined responsibility
- Turborepo leverages the dependency graph for optimal build ordering and caching

### Negative
- 6 packages means 6 `package.json` files, 6 `tsconfig.json` files, and 6 build configurations to maintain
- Adding a new shared concern requires deciding which package it belongs to (or creating a new one)
- Some packages are small (e.g., `@myk9/core`) -- the overhead of a separate package may not always be justified

### Neutral
- All packages use `tsup` for building and produce ESM-only output
- The `workspace:*` protocol in `pnpm` keeps inter-package versions in sync automatically
- Peer dependencies are used for React across all packages to avoid version duplication
