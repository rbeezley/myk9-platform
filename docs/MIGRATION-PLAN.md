# myK9 Platform Monorepo Implementation Plan

> **Goal:** Consolidate myK9Q (scoring app) and myK9Show (show management) into a unified monorepo with shared packages, while keeping myK9Q stable throughout.

## Summary

- **Package namespace:** `@myk9/*`
- **Monorepo folder:** `D:/AI-Projects/myk9-platform`
- **CSS approach:** Tailwind + Base UI via shadcn/ui (preserving myK9Q design tokens)
- **myK9Q CSS:** Keeps existing semantic CSS (no changes)
- **Database:** Eventually consolidated to single Supabase project
- **Timeline:** Quality over speed (~4-5 months total)

---

## Phase 0: Foundation & Tooling (1-2 weeks)

### Monorepo Setup
- [ ] Create `D:/AI-Projects/myk9-platform/` directory
- [ ] Initialize pnpm workspace (`pnpm init`)
- [ ] Create `pnpm-workspace.yaml` with apps/* and packages/*
- [ ] Install and configure Turborepo (`turbo.json`)
- [ ] Create shared TypeScript config (`tsconfig.base.json`)
- [ ] Create shared ESLint config (`.eslintrc.base.js`)
- [ ] Create shared Prettier config (`.prettierrc`)
- [ ] Set up directory structure:
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
- [ ] Initialize git repository
- [ ] Create `.gitignore` (node_modules, dist, .env, etc.)
- [ ] Create initial commit with structure
- [ ] Create GitHub repo `myk9-platform`
- [ ] Push initial structure

---

## Phase 1: Shared Packages Foundation (2-3 weeks)

### 1.1 @myk9/core
- [ ] Create `packages/core/package.json`
- [ ] Create `packages/core/tsconfig.json`
- [ ] Extract from myK9Q:
  - [ ] `src/utils/logger.ts` → `packages/core/src/utils/logger.ts`
  - [ ] `src/utils/networkUtils.ts` → `packages/core/src/utils/network.ts`
  - [ ] `src/config/featureFlags.ts` → `packages/core/src/config/featureFlags.ts`
- [ ] Create shared types:
  - [ ] `BaseEntity` interface (id, created_at, updated_at)
  - [ ] `SyncableEntity` interface (extends BaseEntity with sync metadata)
  - [ ] `LicenseKeyScoped` interface (multi-tenant isolation)
- [ ] Export all from `packages/core/src/index.ts`
- [ ] Write unit tests
- [ ] Verify package builds

### 1.2 @myk9/supabase
- [ ] Create `packages/supabase/package.json`
- [ ] Create Supabase client wrapper (`src/client.ts`)
- [ ] Set up type generation script for database types
- [ ] Create `useSupabase` React hook
- [ ] Export typed client and hooks
- [ ] Verify package builds

### 1.3 @myk9/replication (Critical Package)
- [ ] Create `packages/replication/package.json`
- [ ] Extract from myK9Q `src/services/replication/`:
  - [ ] `ReplicatedTable.ts` → `packages/replication/src/core/ReplicatedTable.ts`
  - [ ] `DatabaseManager.ts` → `packages/replication/src/core/DatabaseManager.ts`
  - [ ] `ReplicatedTableCache.ts` → `packages/replication/src/core/ReplicatedTableCache.ts`
  - [ ] `ReplicatedTableBatch.ts` → `packages/replication/src/core/ReplicatedTableBatch.ts`
  - [ ] `SyncEngine.ts` → `packages/replication/src/sync/SyncEngine.ts`
  - [ ] `SyncOrchestrator.ts` → `packages/replication/src/sync/SyncOrchestrator.ts`
  - [ ] `MutationManager.ts` → `packages/replication/src/sync/MutationManager.ts`
  - [ ] `ConnectionManager.ts` → `packages/replication/src/connection/ConnectionManager.ts`
  - [ ] `PrefetchManager.ts` → `packages/replication/src/connection/PrefetchManager.ts`
  - [ ] `ConflictResolver.ts` → `packages/replication/src/conflict/ConflictResolver.ts`
- [ ] Make `ReplicatedTable` generic (not tied to specific tables)
- [ ] Update imports to use `@myk9/core` and `@myk9/supabase`
- [ ] Export public API from `packages/replication/src/index.ts`
- [ ] Write unit tests for core functionality
- [ ] Verify package builds

---

## Phase 2: Migrate myK9Show to Monorepo (2-3 weeks)

### 2.1 Move myK9Show
- [ ] Copy `D:/AI-Projects/myK9Show-Windsurf/` to `myk9-platform/apps/myk9show/`
- [ ] Update `apps/myk9show/package.json`:
  - [ ] Change name to `@myk9/show`
  - [ ] Add workspace dependencies (`@myk9/core`, `@myk9/replication`, etc.)
- [ ] Update `apps/myk9show/tsconfig.json` to extend base config
- [ ] Verify app builds in monorepo context

### 2.2 Replace Mock Sync Service
- [ ] Delete `apps/myk9show/src/services/sync/syncService.ts` (mock)
- [ ] Create replicated table implementations:
  - [ ] `ReplicatedShowsTable.ts`
  - [ ] `ReplicatedTrialsTable.ts`
  - [ ] `ReplicatedClassesTable.ts`
  - [ ] `ReplicatedEntriesTable.ts`
  - [ ] `ReplicatedDogsTable.ts`
  - [ ] `ReplicatedPeopleTable.ts`
  - [ ] `ReplicatedClubsTable.ts`
- [ ] Wire stores to use replicated tables instead of mock sync
- [ ] Test offline/online sync flow

### 2.3 Migrate from Radix UI to Base UI
- [ ] Run shadcn/ui migration command to switch from Radix to Base UI
- [ ] Update component imports from `@radix-ui/react-*` to Base UI equivalents
- [ ] Test all UI components work correctly after migration
- [ ] Remove old Radix dependencies from package.json

### 2.4 Fix myK9Show Blockers
- [ ] Resolve templateStore circular dependency
- [ ] Fix SyncService constructor issues (now using @myk9/replication)
- [ ] Fix ESLint errors (update to match shared config)
- [ ] Fix build timeout issues
- [ ] Verify `npm run build` succeeds
- [ ] Verify `npm run dev` runs without errors

### 2.5 Migrate Zustand Stores
- [ ] Update stores to import from `@myk9/replication`
- [ ] Replace `syncService.addToQueue()` with `replicatedTable.set()`
- [ ] Use `replicatedTable.subscribe()` for reactive updates
- [ ] Test each store:
  - [ ] showStore
  - [ ] trialStore
  - [ ] classStore
  - [ ] entryStore
  - [ ] dogStore
  - [ ] clubStore
  - [ ] userStore
  - [ ] templateStore

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

### 5.1 Schema Analysis
- [ ] Document myK9Q schema (86 migrations)
- [ ] Document myK9Show schema
- [ ] Identify overlapping tables
- [ ] Identify unique tables per app
- [ ] Design unified schema

### 5.2 Shared Tables Migration
- [ ] Create `dogs` table (shared)
- [ ] Create `people` table (shared, for handlers/owners)
- [ ] Create `clubs` table (shared)
- [ ] Add foreign keys to existing tables:
  - [ ] `entries.dog_id` → `dogs.id`
  - [ ] `entries.handler_id` → `people.id`
- [ ] Keep denormalized fields for backward compatibility

### 5.3 RLS Policies
- [ ] Update RLS for multi-app access
- [ ] Shared tables readable by both apps
- [ ] App-specific write permissions
- [ ] Test access patterns

### 5.4 Data Migration
- [ ] Migrate myK9Show to use myK9Q's Supabase project
- [ ] Update environment variables
- [ ] Run data migration scripts
- [ ] Verify data integrity
- [ ] Decommission old myK9Show Supabase project

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
| `myK9Show/src/services/sync/syncService.ts` | DELETE | Mock to be replaced |
| `myK9Qv3/src/styles/design-tokens.css` | `packages/ui/src/styles/` | Design tokens |

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
