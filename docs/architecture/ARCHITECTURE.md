# Architecture

This document describes the system-level architecture of the myK9 Platform monorepo. It covers how the single myK9Show application is structured, how shared packages are organized, how data flows through the system, and where to extend things when adding new features. Ringside scoring lives inside myK9Show at the `/at-show` route rather than in a separate app.

Read this before working on shared packages, data flow changes, or anything that touches the boundary between the application and infrastructure.

---

## High-Level System Diagram

```
+-------------------------------------------------------------+
|                         Browser                              |
|                                                              |
|  +-------------------------------------------------------+   |
|  |                     myK9Show                          |   |
|  |                React + Tailwind CSS                    |   |
|  |  Show Management  |  Ringside Scoring (/at-show)       |   |
|  +-----------------------------+-------------------------+   |
+--------------------------------|----------------------------+
                                 |
                                 v
+--------------------------------------------------------------+
|              12 Shared Packages (@myk9/*)                     |
|  core | supabase | replication | ui | scoring | ringside ... |
+-----------------------------+--------------------------------+
                              |
                              v
+--------------------------------------------------------------+
|                    Supabase Cloud                             |
|  PostgreSQL | Auth | Edge Functions | Realtime | Storage     |
+--------------------------------------------------------------+
```

The platform is a single application that serves every role at dog sport competitions. **myK9Show** (React + Tailwind CSS) is the full show-management application used by show secretaries and club administrators to configure events, manage entries, and handle exhibitor registrations. The same app also hosts the **ringside scoring** experience at the `/at-show` route, where judges and stewards score classes using an offline-first flow built for venues with poor connectivity. The ringside surface is Tailwind-native (packaged as `@myk9/ringside`); the old semantic-CSS scoring stack has been removed. The app sits on a single backend (Supabase) and a set of workspace packages that encapsulate shared logic, types, and components.

---

## Package Dependency Graph

The shared packages follow a strict directed acyclic graph (DAG) to prevent circular dependencies:

```
@myk9/scoring-ui
  |-- @myk9/ui
  |-- @myk9/core

@myk9/scoring
  (standalone)

@myk9/ui
  (standalone)

@myk9/replication
  |-- @myk9/core
  |-- @myk9/supabase

@myk9/supabase
  |-- @myk9/core

@myk9/core
  (leaf -- no workspace deps)
```

### Package Responsibilities

| Package             | Responsibility                                           | Key Exports                                                                      |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `@myk9/core`        | Utilities, types, and constants shared by everything     | `logger`, `BaseEntity`, `SyncableEntity`, network utilities, nationals constants |
| `@myk9/supabase`    | Supabase client singleton and generated database types   | `supabase` client, `Database` type, `Json` type, query helpers                   |
| `@myk9/replication` | Offline-first data layer with IndexedDB caching and sync | `ReplicatedTable`, `DatabaseManager`, `ConflictResolver`, sync utilities         |
| `@myk9/ui`          | Accessible UI components built on Base UI + Tailwind     | `Button`, `Dialog`, `Select`, tailwind preset, `cn()` utility                    |
| `@myk9/scoring`     | Scoring domain stores and types (pure logic, no UI)      | `useScoringStore`, `useTimerStore`, score types, scoring configs                 |
| `@myk9/scoring-ui`  | Shared behavioral hooks for scoring UIs                  | `useStopwatch`, `useEntryListFilters`, scoresheet components                     |
| `@myk9/ringside`    | The `/at-show` ringside scoring UI and feature package   | Ringside screens, gates, and show-day scoring flows                              |
| `@myk9/secretary`   | Secretary show-management feature package                | Show setup, entry management, and secretary workflow surfaces                    |
| `@myk9/email`       | Email templates and sending helpers                      | Transactional email templates and send utilities                                |
| `@myk9/notifications` | Push and notification helpers                          | Notification dispatch and subscription helpers                                   |
| `@myk9/pwa-update`  | Service-worker update prompt (prompt mode)               | PWA update detection and user-prompt component                                   |
| `@myk9/test-utils`  | Testing utilities and mock factories                     | Test helpers, mock data builders                                                 |

All packages use `tsup` for building and produce ESM-only output. The `workspace:*` protocol in pnpm keeps inter-package versions in sync. React is declared as a peer dependency across all packages to avoid version duplication.

See [docs/adr/006-package-boundaries.md](../adr/006-package-boundaries.md) for full rationale on these boundaries.

---

## Data Flow Patterns

### myK9Show (online-first)

```
Component --> useQuery hook --> Supabase client --> PostgreSQL
Component --> Zustand store (client/UI state only)
Mutation  --> onSuccess --> optimistic cache update --> invalidate queries
```

myK9Show uses **React Query** for all server state. Query hooks are located in `src/hooks/queries/` and follow these conventions:

- **Query keys** use a factory from `src/lib/queryClient.ts` (e.g., `queryKeys.dogs`, `queryKeys.dog(id)`)
- **Cache strategies** are predefined and applied per query:
  - `cacheStrategies.static` -- 30 minutes (breeds, sports, static lookups)
  - `cacheStrategies.moderate` -- 5 minutes (user lists, club data)
  - `cacheStrategies.dynamic` -- 1 minute (show data, entries)
  - `cacheStrategies.realtime` -- 30 seconds (active scoring, live status)
- **Mutations** perform optimistic cache updates in `onSuccess`, then invalidate related queries to ensure consistency

Zustand stores in myK9Show are used exclusively for client-side UI state (modals, filters, selections, wizard steps). They do not hold server data.

### Ringside / `/at-show` (offline-first)

```
Component --> Zustand store --> ReplicatedTable --> IndexedDB (instant)
                                                --> Supabase (background sync)
```

The ringside and show-day flows at `/at-show` are designed to work without a network connection. All reads hit local IndexedDB first, providing instant response times regardless of connectivity.

- **Writes** follow an optimistic pattern: update the Zustand store immediately, queue the mutation in `ReplicatedTable`, and sync to Supabase when a connection is available
- **ReplicatedTable** handles TTL-based caching, background sync, and conflict resolution
- **Conflict strategy** is last-write-wins with a field-authority option for cases where different roles own different fields
- **Sync status** is derived from the offline queue and exposed via `useSyncStatus` so the UI can indicate pending changes

See [docs/adr/004-offline-first-indexeddb.md](../adr/004-offline-first-indexeddb.md) for the full offline-first design.

---

## State Management Strategy

### Decision Matrix

| Tool                  | Use For                                  | Examples                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| **Zustand**           | Client/UI state shared across components | Modals, filters, selections, domain stores |
| **React Query**       | Server state, async data fetching        | Lists, detail views, search results        |
| **React Context**     | Cross-cutting concerns (rarely changes)  | Auth/RBAC, theme, app-wide config          |
| **@myk9/replication** | Persistent data that must work offline   | Show data, class entries, scores (ringside `/at-show`) |
| **Local useState**    | Ephemeral, component-scoped state        | Form inputs, timers, dialog open/close     |

### Zustand Conventions

- **Location:** `src/store/` in myK9Show (canonical)
- **Naming:** `use<Domain>Store` (e.g., `useShowStore`, `useScoringStore`, `useTrialStore`)
- **Actions:** Return `Promise` for operations that touch the database
- **Optimistic updates:** Update Zustand state immediately, let the replication layer sync in the background
- **Ringside / offline stores** use `devtools` + `persist` middleware so state survives across show-day reloads (Zustand persists to localStorage)
- **Most myK9Show stores** are plain Zustand (persistence is handled by React Query cache and the server)
- **Shared stores** in `@myk9/scoring` expose a factory function and a default instance:
  ```typescript
  export function createScoringStore(enableDevtools = false) {
    /* ... */
  }
  export const useScoringStore = createScoringStore();
  ```

### Anti-Patterns

- **Do not** bypass `@myk9/replication` with direct Supabase calls in ringside/`/at-show` -- this breaks offline support
- **Do not** use `useState` for server data that should be cached -- use React Query instead
- **Do not** add new Context providers for domain data -- use Zustand stores
- **Do not** duplicate stores between the app and packages -- extract shared stores to a `@myk9/*` package

---

## Authentication Architecture

### myK9Show -- OAuth

myK9Show uses **Supabase Auth** with email/password signup and JWT-based sessions.

- **AuthContext** provider wraps the app and exposes a `useAuth()` hook
- **RBAC** is enforced via three database tables: `roles`, `user_roles`, and `permissions`
- **RBACService** provides role and permission checks at the application layer
- The `useAuth()` hook exposes convenience flags for common role checks:
  - `isAdmin`, `isSecretary`, `isExhibitor`, `isJudge`
  - `hasRole(role)` for arbitrary role checks
  - `hasPermission(permission, scope?)` for granular permission checks
- Sessions are automatically refreshed by the Supabase client

### Ringside Passcode (`/at-show`)

The ringside experience inside myK9Show uses a lightweight passcode-based login designed for quick access at the ring. This is not a separate app's auth -- it powers the `/at-show` ringside flow within myK9Show.

- **Passcode format:** `[role letter][4 hex digits]` (e.g., `aa260`, `jf472`)
- **Role mapping:** `a` = admin, `j` = judge, `s` = steward, `e` = exhibitor
- **Authentication flow:** The `validate-passcode` Edge Function verifies the passcode and returns a session
- **Offline recovery:** On login, the app checks `offlineQueueStore` for pending scores before clearing any cached data
- **Data scoping:** A `license_key` field on the ringside/show-day tables provides per-show isolation, enforced via Supabase RLS policies

---

## Database Architecture

myK9Show runs on a single **Supabase project** (`myk9-platform`, ref: `sojmvhhwsjxmfistvzbe`).

### Data Hierarchy

The core data model follows a strict hierarchy:

```
Show
  |-- Trial (one show has many trials, each for a specific sport)
       |-- Class (one trial has many classes, each a specific level/division)
            |-- Entry (one class has many entries, each a dog+handler pair)
                 |-- Scoring data (embedded in entry or related tables)
```

### Multi-Tenancy

The ringside/show-day tables use a `license_key` field for per-show data isolation. This ensures that scoring data from one show cannot leak into another. The license key is set at login time and enforced by RLS policies on every query.

### Row-Level Security

RLS is enforced on all tables. Policies cover:

- Authenticated user access scoped by role
- License-key-based isolation for ringside/show-day data
- Show secretary access to their own shows
- Exhibitor access limited to their own entries and dogs
- Admin full-access policies

### Migrations

The schema is built up incrementally by roughly 278 timestamp-named migrations (e.g. `20260614100000_...sql`) in `supabase/migrations/`. The schema is best read directly from the live migrations rather than a static per-range table. The project ref is `sojmvhhwsjxmfistvzbe`.

---

## Deployment Architecture

```
GitHub (main branch)
  |
  |---> Vercel: myK9Show --> myk9-platform-myk9show.vercel.app
  |
  +---> CI: typecheck --> lint --> test (parallel) --> build
        (Turborepo remote caching via TURBO_TOKEN)

Supabase Cloud (myk9-platform)
  |-- PostgreSQL + RLS (~278 migrations)
  |-- Auth (Supabase email/password + RBAC; ringside passcode for /at-show)
  |-- Edge Functions (~28; see API.md)
  |-- Realtime subscriptions
  +-- Storage (images bucket)
```

### Vercel

After the full GitHub Actions CI workflow passes on `main`, the CI-gated production workflow deploys the exact merge SHA to the myK9Show and guides Vercel projects. Vercel Git deployments from `main` are disabled, while PR previews remain enabled. The project root directories point at `apps/myk9show/` and `apps/docs/`. Turborepo remote caching (via `TURBO_TOKEN`) speeds up CI builds by reusing previous build artifacts.

### Edge Functions

There are roughly 28 Edge Functions split across two locations:

- `supabase/functions/` -- platform, ringside, and notification functions (e.g. `validate-passcode`, rules assistant/search, push notifications)
- `apps/myk9show/supabase/functions/` -- Stripe billing and cron functions (checkout, customer portal, webhook, scheduled cleanup)

See [API.md](API.md) for the complete, up-to-date function inventory. Edge Functions are deployed via the Supabase CLI with `--no-verify-jwt` (each function handles its own authentication internally).

### Legacy Production

The legacy production site at `myk9q.com` runs from a separate repository and remains untouched. The staging deployment above is the monorepo version.

---

## Competition Sports

The platform supports scoring for multiple dog sport organizations and formats:

| Sport           | Organization | Scoring Model                    |
| --------------- | ------------ | -------------------------------- |
| Scent Work      | AKC          | Pass/Fail + time, faults, alerts |
| Fast CAT        | AKC          | Speed (MPH) calculation          |
| Nosework        | UKC          | Pass/Fail + time, faults         |
| Obedience       | UKC          | Points deduction from 200        |
| Rally           | UKC          | Points deduction with bonus      |
| Scent Detection | ASCA         | Pass/Fail + time                 |
| Nationals       | AKC          | Multi-element aggregate scoring  |

Each sport has its own scoring configuration defined in `@myk9/scoring` and a corresponding scoresheet UI component in `@myk9/scoring-ui`. The scoring model determines which fields are collected (time, faults, points, pass/fail), how results are calculated, and how placements are determined.

---

## Extension Points

### Adding a new scoring format

1. Define the score type and configuration in `@myk9/scoring` (packages/scoring)
2. Create a scoresheet component in `@myk9/scoring-ui` (packages/scoring-ui)
3. Register the format in `scoresheetRouter.ts` so the correct scoresheet is rendered based on the sport/format

### Adding a new Edge Function

1. Create the function directory under `supabase/functions/<name>/` (platform, ringside, notifications) or `apps/myk9show/supabase/functions/<name>/` (Stripe billing, cron)
2. Add an `index.ts` with the handler (follow existing functions for CORS, auth, and error handling patterns)
3. Deploy with `supabase functions deploy <name> --no-verify-jwt`

### Adding a new shared package

1. Create the package directory under `packages/<name>/`
2. Add `package.json`, `tsconfig.json`, and `tsup.config.ts` (use `@myk9/core` as a template)
3. Add the package to `pnpm-workspace.yaml`
4. Follow the dependency graph rules: packages never depend on apps, and respect the existing DAG

### Adding a new Zustand store

1. Create the store file in `src/store/` (myK9Show)
2. Follow the `use<Domain>Store` naming convention
3. For ringside/offline stores: include `devtools` and `persist` middleware so state survives show-day reloads
4. If the store will be shared with a feature package, extract it to a shared `@myk9/*` package instead

---

## ADR Reference

All architectural decisions are documented as Architecture Decision Records:

1. [ADR-001: Monorepo with pnpm + Turborepo](../adr/001-monorepo-pnpm-turborepo.md)
2. [ADR-002: Base UI over Radix for UI components](../adr/002-base-ui-over-radix.md)
3. [ADR-003: Zustand for state management](../adr/003-zustand-state-management.md)
4. [ADR-004: Offline-first with IndexedDB](../adr/004-offline-first-indexeddb.md)
5. [ADR-005: Dual UI strategy (Tailwind vs Semantic)](../adr/005-dual-ui-strategy.md)
6. [ADR-006: Package boundaries and dependency graph](../adr/006-package-boundaries.md)
7. [ADR-007: Supabase as backend](../adr/007-supabase-backend.md)

All ADRs are located in [docs/adr/](../adr/).
