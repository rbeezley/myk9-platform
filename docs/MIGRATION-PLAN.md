# myK9 Platform Monorepo Implementation Plan

> **Goal:** Consolidate myK9Q (scoring app) and myK9Show (show management) into a unified monorepo with shared packages, while keeping myK9Q stable throughout.

## Current Status

| Phase | Status | Completed |
|-------|--------|-----------|
| Phase 0: Foundation & Tooling | ✅ Complete | Jan 2026 |
| Phase 1: Shared Packages | ✅ Complete | Jan 2026 |
| Phase 2: Migrate myK9Show | 🔄 In Progress (2.1, 2.2, 2.3 done) | - |
| Phase 3: Shared UI Components | ⏳ Pending | - |
| Phase 4: Migrate myK9Q | ⏳ Pending | - |
| Phase 5: Database Consolidation | ⏳ Pending | - |
| Phase 6: Scoring Package | ⏳ Pending | - |
| Phase 7: Testing & Validation | ⏳ Pending | - |
| Phase 8: Deployment & Cleanup | ⏳ Pending | - |

**Next step:** Phase 2.4 - Fix myK9Show Blockers

---

## Summary

- **Package namespace:** `@myk9/*`
- **Monorepo folder:** `D:/AI-Projects/myk9-platform`
- **CSS approach:** Tailwind + Base UI via shadcn/ui (preserving myK9Q design tokens)
- **myK9Q CSS:** Keeps existing semantic CSS (no changes)
- **Database:** NEW Supabase project for monorepo (original projects remain untouched until cutover)
- **Timeline:** Quality over speed

---

## Phase 0: Foundation & Tooling ✅ COMPLETE

### Monorepo Setup
- [x] Create `D:/AI-Projects/myk9-platform/` directory
- [x] Initialize pnpm workspace (`pnpm init`)
- [x] Create `pnpm-workspace.yaml` with apps/* and packages/*
- [x] Install and configure Turborepo (`turbo.json`)
- [x] Create shared TypeScript config (`tsconfig.base.json`)
- [x] Create shared ESLint config (`.eslintrc.base.js`) - deferred to Phase 3
- [x] Create shared Prettier config (`.prettierrc`) - deferred to Phase 3
- [x] Set up directory structure:
  ```
  myk9-platform/
  ├── apps/
  │   └── myk9show/        # myK9Show goes here first
  ├── packages/
  │   ├── core/            # @myk9/core
  │   ├── replication/     # @myk9/replication
  │   ├── supabase/        # @myk9/supabase
  │   ├── ui/              # @myk9/ui
  │   └── scoring/         # @myk9/scoring
  └── docs/
  ```

### Git Setup
- [x] Initialize git repository
- [x] Create `.gitignore` (node_modules, dist, .env, etc.)
- [x] Create initial commit with structure
- [x] Create GitHub repo `myk9-platform`
- [x] Push initial structure

---

## Phase 1: Shared Packages Foundation ✅ COMPLETE

### 1.1 @myk9/core ✅
- [x] Create `packages/core/package.json`
- [x] Create `packages/core/tsconfig.json`
- [x] Extract from myK9Q:
  - [x] `src/utils/logger.ts` → `packages/core/src/utils/logger.ts`
  - [x] `src/utils/networkUtils.ts` → `packages/core/src/utils/network.ts` (timeout, retry, backoff)
  - [ ] `src/config/featureFlags.ts` → deferred (not needed yet)
- [x] Create shared types:
  - [x] `BaseEntity` interface (id, created_at, updated_at)
  - [x] `SyncableEntity` interface (extends BaseEntity with sync metadata)
  - [x] `LicenseKeyScoped` interface (multi-tenant isolation)
- [x] Export all from `packages/core/src/index.ts`
- [ ] Write unit tests - deferred to Phase 7
- [x] Verify package builds

### 1.2 @myk9/supabase ✅
- [x] Create `packages/supabase/package.json`
- [x] Create Supabase client wrapper (`src/client.ts`)
  - [x] Configurable client with license key header injection for multi-tenant RLS
- [ ] Set up type generation script - deferred (app-specific types for now)
- [x] Create `useSupabase` React hook
- [x] Export typed client and hooks
- [x] Verify package builds

### 1.3 @myk9/replication ✅ (Critical Package)
- [x] Create `packages/replication/package.json`
- [x] Extract from myK9Q `src/services/replication/`:
  - [x] `ReplicatedTable.ts` → `packages/replication/src/ReplicatedTable.ts`
  - [x] `DatabaseManager.ts` → `packages/replication/src/DatabaseManager.ts`
  - [x] `ReplicatedTableCache.ts` → `packages/replication/src/ReplicatedTableCache.ts`
  - [x] `ReplicatedTableBatch.ts` → `packages/replication/src/ReplicatedTableBatch.ts`
  - [ ] Sync engine components deferred (app-specific orchestration for now)
- [x] Make `ReplicatedTable` generic (not tied to specific tables)
- [x] Dependency injection interfaces (Logger, LogDiagnostics, GetTableTTL, HandleDatabaseCorruption)
- [x] Export public API from `packages/replication/src/index.ts`
- [ ] Write unit tests - deferred to Phase 7
- [x] Verify package builds

**Key Features Extracted:**
- DatabaseManager: Singleton IndexedDB connection with timeout protection, transaction queue for stampede prevention, corruption detection/recovery
- ReplicatedTableCache: TTL expiration (with offline protection), LRU/LFU hybrid eviction, subscription management with leading-edge debounce
- ReplicatedTableBatch: Bulk insert with chunking for large syncs, ID normalization (critical for Supabase bigint → IndexedDB keys)
- ReplicatedTable: Abstract base class with optimistic updates, version tracking, conflict resolution hooks, sync orchestration

---

## Phase 2: Migrate myK9Show to Monorepo 🔄 IN PROGRESS

### 2.1 Move myK9Show ✅ COMPLETE
- [x] Copy `D:/AI-Projects/myK9Show-Windsurf/` to `myk9-platform/apps/myk9show/`
  - [x] src/, public/, assets/, server/, supabase/ directories
  - [x] Config files (package.json, tsconfig files, vite.config.ts, etc.)
  - [x] vite-plugins/, scripts/, docs/style-guides/design-tokens.json
- [x] Update `apps/myk9show/package.json`:
  - [x] Change name to `@myk9/show`
  - [x] Add workspace dependencies (`@myk9/core`, `@myk9/replication`, `@myk9/supabase`)
- [x] Update `apps/myk9show/tsconfig.app.json` to extend base config
- [x] Fix TypeScript 5.6 type issues:
  - [x] `CompressionService.ts`: `new Blob([compressed as BlobPart])` for Uint8Array
  - [x] `encryption.ts`: `salt as BufferSource` for PBKDF2 param
- [x] Fix Vite 6 plugin type compatibility (cast plugins to `PluginOption`)
- [x] Verify app builds in monorepo context ✅
  - Build time: ~90 seconds with Turborepo caching
  - Some chunk size warnings (react-dom-vendor 767KB) - future optimization

### 2.2 Replace Mock Sync Service ✅ COMPLETE
- [x] Deprecate `apps/myk9show/src/services/sync/syncService.ts` (kept as stub for Phase 6)
- [x] Create replicated table implementations:
  - [x] `ReplicatedShowsTable.ts`
  - [x] `ReplicatedTrialsTable.ts`
  - [x] `ReplicatedClassesTable.ts`
  - [x] `ReplicatedEntriesTable.ts`
  - [x] `ReplicatedDogsTable.ts`
  - [ ] `ReplicatedPeopleTable.ts` - deferred (userStore uses database-first approach)
  - [ ] `ReplicatedClubsTable.ts` - deferred (clubStore uses database-first approach)
- [x] Wire stores to use replicated tables instead of mock sync
- [x] Create ReplicationSyncProvider to orchestrate sync:
  - [x] Auto-sync on app startup (2s delay)
  - [x] Sync when network status changes from offline to online
  - [x] `useReplicationSync()` hook for manual sync control
- [x] Add ReplicationSyncProvider to App.tsx
- [x] Build passes with all changes

### 2.3 Migrate from Radix UI to Base UI ✅ COMPLETE
- [x] Install `@base-ui/react` package
- [x] Migrate all UI components from Radix to Base UI:
  - [x] Accordion → Base UI Accordion
  - [x] Checkbox → Base UI Checkbox
  - [x] Collapsible → Base UI Collapsible
  - [x] Switch → Base UI Switch
  - [x] Tabs → Base UI Tabs
  - [x] Progress → Base UI Progress
  - [x] Radio Group → Base UI RadioGroup
  - [x] Separator → Native HTML hr
  - [x] Label → Base UI Field.Label
  - [x] Select → Base UI Select
  - [x] Dialog → Base UI Dialog
  - [x] Dropdown Menu → Base UI Menu
  - [x] Tooltip → Base UI Tooltip
  - [x] Popover → Base UI Popover
  - [x] ScrollArea → Native CSS overflow-auto
  - [x] Avatar → Native implementation
- [x] Remove 18 Radix UI dependencies from package.json
- [x] Add API compatibility wrappers for Radix → Base UI differences:
  - [x] `asChild` prop → `render` prop adapter
  - [x] `onValueChange(value)` → `onValueChange(value, eventDetails)` wrapper
  - [x] Data attribute changes: `data-[state=open]` → `data-[open]`
  - [x] No-op PopoverAnchor for backwards compatibility
- [x] Build succeeds with Vite

**Known Issues (pre-existing, unrelated to Base UI):**
- TypeScript strict mode array inference issues (`never[]` for empty arrays)
- Build script temporarily skips `tsc --noEmit` check (use `build:strict` for full check)
- TODO: Fix array type annotations and re-enable strict TypeScript checking

### 2.4 Fix myK9Show Blockers
- [x] Verify `npm run build` succeeds (via pnpm build)
- [ ] Resolve templateStore circular dependency
- [x] Fix SyncService constructor issues (now using @myk9/replication)
- [ ] Fix ESLint errors (update to match shared config)
- [ ] Verify `npm run dev` runs without errors

### 2.5 Migrate Zustand Stores ✅ COMPLETE
- [x] Update stores to import from `@myk9/replication`
- [x] Replace `syncService.addToQueue()` with `replicatedTable.set()`
- [x] Use `replicatedTable.subscribe()` for reactive updates
- [x] Test each store:
  - [x] showStore - uses replicatedShowsTable with subscription
  - [x] trialStore - uses replicatedTrialsTable with subscription
  - [x] classStore - uses replicatedClassesTable with subscription
  - [x] entryStore - uses replicatedEntriesTable with subscription
  - [x] dogStore - uses replicatedDogsTable with subscription
  - [x] clubStore - uses database-first approach (no replication needed)
  - [x] userStore - uses database-first approach (no replication needed)
  - [ ] templateStore - deferred (has circular dependency issues)

---

## Phase 3: Shared UI Components (2 weeks)

### 3.1 @myk9/ui Package Setup
- [ ] Create `packages/ui/package.json`
- [ ] Install Tailwind CSS and Base UI (via shadcn/ui)
- [ ] Initialize shadcn/ui with Base UI style (e.g., `base-vega`)
- [ ] Create Tailwind preset with design tokens
- [ ] Extract CSS variables from myK9Q:
  - [ ] Status colors (--status-checked-in, --status-at-gate, etc.)
  - [ ] Spacing tokens (--token-space-xs, --token-space-sm, etc.)
  - [ ] Typography tokens
  - [ ] Color palette

### 3.2 Extract UI Primitives
- [ ] Button component (from Base UI + Tailwind)
- [ ] Badge component
- [ ] Card component
- [ ] Dialog component (from Base UI)
- [ ] Input components (text, select, checkbox)
- [ ] Form components

### 3.3 Extract Domain Components
- [ ] StatusBadge (class status display)
- [ ] EntryCard (entry display)
- [ ] ClassCard (class display)
- [ ] TimerDisplay (timer UI)
- [ ] PageLayout (standard page wrapper)

### 3.4 Update Apps to Use @myk9/ui
- [ ] Update myK9Show imports to use @myk9/ui
- [ ] Verify consistent styling
- [ ] Test responsive behavior

---

## Phase 4: Migrate myK9Q to Monorepo (2-3 weeks)

> **CAUTION:** myK9Q is production-ready. Extra care required.

### 4.1 Pre-Migration Checks
- [ ] Tag current myK9Q state: `git tag pre-monorepo-migration`
- [ ] Ensure all tests pass in original repo
- [ ] Document current behavior for comparison

### 4.2 Move myK9Q
- [ ] Copy `D:/AI-Projects/myK9Qv3/` to `myk9-platform/apps/myk9q/`
- [ ] Update `apps/myk9q/package.json`:
  - [ ] Change name to `@myk9/q`
  - [ ] Add workspace dependencies
- [ ] Update `apps/myk9q/tsconfig.json`

### 4.3 Update myK9Q Imports
- [ ] Replace local replication imports with `@myk9/replication`
- [ ] Replace local utils with `@myk9/core`
- [ ] Replace local UI components with `@myk9/ui` (where applicable)
- [ ] Keep myK9Q-specific table implementations in app

### 4.4 Validation
- [ ] Run all unit tests - must pass
- [ ] Run all E2E tests - must pass
- [ ] Manual testing:
  - [ ] Offline mode works
  - [ ] Scoring works
  - [ ] Real-time sync works
  - [ ] PWA install works
- [ ] Compare bundle size to original
- [ ] Compare performance to original

---

## Phase 5: Database Consolidation (3-4 weeks)

> **CRITICAL:** Create a NEW Supabase project for the monorepo. Do NOT modify the production myK9Q database until fully validated.

### 5.1 Create New Supabase Project
- [ ] Create new Supabase project: `myk9-platform` (or similar)
- [ ] This becomes the unified database for both monorepo apps
- [ ] Original myK9Q Supabase project remains UNTOUCHED (production fallback)
- [ ] Original myK9Show Supabase project remains available during transition

### 5.2 Schema Analysis & Design
- [ ] Document myK9Q schema (86 migrations)
- [ ] Document myK9Show schema
- [ ] Identify overlapping tables
- [ ] Identify unique tables per app
- [ ] Design unified schema for new project

### 5.3 Build Unified Schema (in NEW project)
- [ ] Create `dogs` table (shared)
- [ ] Create `people` table (shared, for handlers/owners)
- [ ] Create `clubs` table (shared)
- [ ] Create all myK9Q-specific tables
- [ ] Create all myK9Show-specific tables
- [ ] Add foreign keys and relationships
- [ ] Keep denormalized fields for backward compatibility

### 5.4 RLS Policies (in NEW project)
- [ ] Configure RLS for multi-app access
- [ ] Shared tables readable by both apps
- [ ] App-specific write permissions
- [ ] Test access patterns thoroughly

### 5.5 Connect Monorepo Apps to New Project
- [ ] Update `@myk9/show` environment variables to use new project
- [ ] Update `@myk9/q` environment variables to use new project
- [ ] Test both apps work correctly with new database
- [ ] Run all E2E tests against new project

### 5.6 Data Migration (only after full validation)
- [ ] Export data from original myK9Q Supabase project
- [ ] Export data from original myK9Show Supabase project
- [ ] Import/merge data into new unified project
- [ ] Verify data integrity
- [ ] Run comparison tests (old vs new)

### 5.7 Production Cutover (separate from code migration)
- [ ] Schedule maintenance window
- [ ] Final data sync from production
- [ ] Update production DNS/config to point to new project
- [ ] Verify production works
- [ ] Keep old projects as backup for 30+ days
- [ ] Only decommission old projects after extended validation period

---

## Phase 6: Scoring Package (2 weeks)

### 6.1 @myk9/scoring Package
- [ ] Create `packages/scoring/package.json`
- [ ] Extract from myK9Q:
  - [ ] Scoresheet components
  - [ ] Score input components
  - [ ] Timer components
  - [ ] Result display components
- [ ] Extract scoring hooks:
  - [ ] `useOptimisticScoring`
  - [ ] `useScoreEntry`
  - [ ] `useTimer`
- [ ] Extract scoring rules:
  - [ ] AKC rules
  - [ ] UKC rules
  - [ ] ASCA rules

### 6.2 Integrate Scoring in Both Apps
- [ ] Update myK9Q to import from `@myk9/scoring`
- [ ] Add scoring views to myK9Show (read-only or simplified)
- [ ] Verify identical scoring behavior

---

## Phase 7: Testing & Validation (2 weeks)

### 7.1 Test Infrastructure
- [ ] Set up cross-app E2E tests in `e2e/`
- [ ] Create test scenarios:
  - [ ] Score entry in myK9Q, verify in myK9Show
  - [ ] Create show in myK9Show, score in myK9Q
  - [ ] Offline sync in both apps
  - [ ] Conflict resolution

### 7.2 Final Validation
- [ ] All myK9Q tests pass
- [ ] All myK9Show tests pass
- [ ] Cross-app data consistency verified
- [ ] Performance benchmarks acceptable
- [ ] Bundle sizes acceptable
- [ ] PWA functionality works in both apps

### 7.3 Documentation
- [ ] Update CLAUDE.md for monorepo
- [ ] Document package APIs
- [ ] Document database schema
- [ ] Document deployment process

---

## Phase 8: Deployment & Cleanup (1 week)

### 8.1 Deployment Setup
- [ ] Configure CI/CD for monorepo (GitHub Actions)
- [ ] Set up separate deployments:
  - [ ] myK9Q → myk9q.com / app.myk9q.com
  - [ ] myK9Show → TBD
- [ ] Configure environment variables

### 8.2 Cleanup
- [ ] Archive original repos (don't delete)
- [ ] Update all documentation
- [ ] Notify any stakeholders of new structure

---

## Critical Files Reference

| Source | Destination | Purpose |
|--------|-------------|---------|
| `myK9Qv3/src/services/replication/ReplicatedTable.ts` | `packages/replication/src/core/` | Core offline-first base class |
| `myK9Qv3/src/services/replication/ReplicationManager.ts` | `packages/replication/src/core/` | Sync orchestration |
| `myK9Qv3/src/services/replication/MutationManager.ts` | `packages/replication/src/sync/` | Offline mutation queue |
| `myK9Show/src/services/sync/syncService.ts` | DEPRECATED | Kept as stub for Phase 6 features |
| `myK9Qv3/src/styles/design-tokens.css` | `packages/ui/src/styles/` | Design tokens |

### Phase 2.2 New Files

| File | Purpose |
|------|---------|
| `apps/myk9show/src/providers/ReplicationSyncProvider.tsx` | Orchestrates sync for all replicated tables |
| `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts` | Show data replication |
| `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` | Trial data replication |
| `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` | Class data replication |
| `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts` | Entry data replication |
| `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts` | Dog data replication |
| `apps/myk9show/src/services/replication/index.ts` | Barrel exports for replication services |

---

## Risk Mitigation

- [ ] **Never delete** original repos until monorepo is proven
- [ ] **Tag** all repos before migration: `pre-monorepo-migration`
- [ ] **Feature flags** for gradual rollout of shared packages
- [ ] **Rollback plan:** Deploy from original repos if issues arise

---

## Notes & Decisions

- **CSS (myK9Show):** Tailwind + Base UI (via shadcn/ui) - better long-term support than Radix
- **CSS (myK9Q):** Keeps existing semantic CSS - no changes to working production app
- **Why Base UI over Radix:** Radix development stagnated after WorkOS acquisition; Base UI is actively maintained by original Radix creators + MUI team
- **Package Manager:** pnpm for workspace support and speed
- **Build Tool:** Turborepo for caching and parallel builds
- **myK9Q stays untouched** until Phase 4 (after myK9Show is stable in monorepo)
- **Database strategy:** Create NEW Supabase project for monorepo - never modify production myK9Q database during development. Original projects stay as fallback until full validation complete.

### Base UI Migration Patterns (Phase 2.3)

Key API differences between Radix UI and Base UI that required compatibility wrappers:

| Radix Pattern | Base UI Equivalent | Wrapper Approach |
|---------------|-------------------|------------------|
| `asChild` prop | `render` prop | Check for `asChild` and use `render={children}` |
| `onValueChange(value)` | `onValueChange(value, eventDetails)` | Wrap callback to discard second param |
| `data-[state=open]` | `data-[open]` | Update Tailwind classes |
| `data-[state=checked]` | `data-[checked]` | Update Tailwind classes |
| `Positioner` implicit | `Positioner` explicit | Wrap floating elements in `Positioner` |
| `forwardRef` on Root | No ref on some Roots | Use function components where ref not supported |

Components that needed no-op wrappers for backwards compatibility:
- `PopoverAnchor` - Base UI doesn't have Anchor component, use plain `<div>` wrapper
