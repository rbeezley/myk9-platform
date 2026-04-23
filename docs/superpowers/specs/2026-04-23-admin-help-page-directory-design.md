# Admin Help — Page Directory — Design Spec

**Date:** 2026-04-23
**Status:** Draft (awaiting user review)
**Scope:** New `/admin/help` page — a searchable, role-grouped directory of every page in myK9Show

---

## Problem Summary

As the platform grows, there is no single place in myK9Show where a site admin can see what pages exist, who they're for, or how to reach them. Orientation currently requires manually exploring the sidebar under each role or reading source code. This is painful for the site admin during Fall 2026 stabilization (Phase 2 golden-path work) and will be equally painful for future admins, new team members, and — eventually — end users who want contextual help.

**The v1 audience is the site admin** ("me, so I can quickly navigate to each page and understand what its use is"). The design must leave the door open for a later evolution into role-scoped help for every user, but v1 does not ship that UX.

---

## Goals and Non-Goals

**Goals**
- Site admin can open one page and see every page in the app, grouped by role.
- Each entry explains purpose in plain English and links to the page (with a real example ID when the route is parameterized).
- Missing documentation is visible — if a new route lands in `routeRegistry.ts` without a directory entry, the admin sees it flagged.
- The data model is already role-aware so later releases can filter to non-admin users by flipping the access gate and the visibility filter.

**Non-goals (v1)**
- Navigation flow diagram (deferred to separate todo).
- Screenshots per page (high maintenance).
- Journey cross-references (can be added via a future optional field).
- Role-filtered UX for non-admin users (gate stays SITE_ADMIN).
- Keyword/synonym search (title + description search is enough).
- Global drawer or command-palette surface (dedicated page only).
- User-selectable example IDs for parameterized routes (auto-resolve one representative row).

---

## Architecture Overview

New feature folder at `apps/myk9show/src/features/admin-help/`:

```
admin-help/
├── data/
│   └── pageDirectory.ts             # hand-authored PageEntry[] for all user-facing routes
├── hooks/
│   └── useExampleIds.ts             # React Query: one sample ID per parameterized table
├── utils/
│   ├── routeDiff.ts                 # pure: missing + extra routes between registry and directory
│   └── resolveExamplePath.ts        # pure: substitute :params with resolved ids
├── components/
│   ├── AdminHelpPage.tsx            # route target, owns search/filter state
│   ├── PageDirectorySection.tsx     # collapsible role group
│   ├── PageDirectoryRow.tsx         # single entry with "Go to page" button
│   └── UndocumentedRoutesPanel.tsx  # collapsible panel listing directory drift
└── __tests__/                       # unit + component tests
```

Route wired in `apps/myk9show/src/routes/adminRoutes.tsx` and added to `routeRegistry.ts` for preload consistency. Sidebar entry "Help" added under the admin section, visible only to SITE_ADMIN.

---

## Source of Truth — Hybrid Model

Two inputs combine to produce the rendered directory:

1. **`routeRegistry.ts`** — authoritative list of real routes. Already exists. Used only to detect drift (via `routeDiff`).
2. **`pageDirectory.ts`** — hand-authored entry per route, with the user-facing metadata that a machine cannot infer.

**Why hybrid:** a pure auto-generated approach can't produce the descriptions, role assignments, categories, or status that this directory needs. A pure hand-authored approach silently drifts as new routes land. The hybrid model gets both — curation where it helps, drift detection where it hurts.

**The `UndocumentedRoutesPanel` diffs the two on every render**, showing any route in `fullRouteRegistry` that lacks a matching `PageEntry`. A future stretch goal is a CI lint rule that fails when the diff is non-empty.

---

## Data Model

```typescript
// apps/myk9show/src/features/admin-help/data/pageDirectory.ts

export type PageStatus = 'working' | 'stub' | 'known-issues';
export type PageClassification = 'critical-path' | 'park' | 'hidden';

export interface PageEntry {
  path: string;                       // must key into fullRouteRegistry
  title: string;                      // display name (e.g. "Show Entries")
  description: string;                // 1-2 sentences, plain English
  roles: UserRole[];                  // who uses it; enables later role-filter UX
  classification: PageClassification; // matches feature-audit-2026.md labels
  category: string;                   // cross-role slice: "Shows", "Entries", "Dogs", …
  status: PageStatus;
}

export const pageDirectory: readonly PageEntry[] = [
  // ~50 entries covering every route in fullRouteRegistry
];
```

**Why these fields:** `path` is the join key with `routeRegistry.ts` so the diff is a trivial Set subtraction. `roles` is an array so a page used by multiple roles (e.g., Browse Shows) appears correctly. `classification` matches the vocabulary already in `docs/feature-audit-2026.md` so seeding is a copy-paste. `category` is a free string for v1 — a fixed union can come later once the list stabilizes. `status` is a flag visible to the admin for triage.

**Categories seeded as a conventional list:** `Shows`, `Entries`, `Dogs`, `Clubs`, `People`, `Reports`, `Results`, `Payments`, `Admin`, `Auth`, `Public`. Free-form so additions don't require a type change.

---

## Route, Access, and Sidebar

**Route:** `/admin/help`, registered in `adminRoutes.tsx` and `routeRegistry.ts`.

**Access:** Gated with the same `RequireRole={UserRole.SITE_ADMIN}` pattern used by other `/admin/*` routes. Exhibitors, secretaries, judges, and club admins receive the standard "you don't have permission" gate. This is deliberate — the v1 audience is the site admin only.

**Sidebar:** A new "Help" item is added to the admin section of `unifiedSidebarConfig.ts`, visible only to SITE_ADMIN. The Fall 2026 Phase 1 decision to keep admin nav minimal (Dashboard, Users, Roles & Permissions) is preserved for operational items; "Help" is a utility entry point and is acceptable as a fourth item. It sits at the bottom of the admin section, visually separated if a grouping primitive is available.

---

## UI Layout and Interaction

```
┌──────────────────────────────────────────────────────────────┐
│  Page Directory                                              │
│  [🔍 Search pages by title, description, path…         ]    │
│                                                              │
│  Role: [All ▼]  Category: [All ▼]                           │
│  Classification: [All ▼]  Status: [All ▼]                   │
│  [✓] Show parked pages   [✓] Show hidden/dev pages          │
│                                                              │
│  ▼ Site Admin (14 pages)                                     │
│     ┌──────────────────────────────────────────────────┐    │
│     │ Admin Dashboard  /admin/dashboard     [critical]  │    │
│     │ System health overview and active shows.          │    │
│     │ Categories: Admin · Status: working               │    │
│     │                                   [ Go to page → ]│    │
│     └──────────────────────────────────────────────────┘    │
│     ...                                                      │
│                                                              │
│  ▼ Secretary (19 pages)                                      │
│     ...                                                      │
│                                                              │
│  ⚠ Undocumented Routes (3)                                   │
│     • /admin/performance                                     │
│     • /admin/onboarding                                      │
│     • /tv/:showId                                            │
└──────────────────────────────────────────────────────────────┘
```

### Search
Client-side substring match across `title`, `description`, `path`, and `category`. The directory is < 200 entries — a simple case-insensitive `.includes` over the visible subset is sufficient. A fuzzy library (fuse.js) is an easy upgrade if ranking becomes important; it is not required for v1.

### Filters
The four dropdowns — Role, Category, Classification, Status — combine with AND. All default to "All".

### Toggles
- **Show parked pages** — default OFF. Hides rows with `classification === 'park'`.
- **Show hidden/dev pages** — default OFF. Hides rows with `classification === 'hidden'`.

The admin's typical view is therefore "only critical-path pages", which matches the operational reality during Fall 2026 stabilization.

### Section collapse
Each role section is an accordion that persists its open/closed state to `localStorage` (key `admin-help:section:<role>`), so preferred view survives reloads.

### "Go to page" button
- Non-parameterized route: regular `<Link to={path}>`; button always enabled.
- Parameterized route with resolved IDs: `<Link>` to the substituted path.
- Parameterized route with missing IDs: button disabled with a tooltip explaining the empty state ("No shows exist — create one first").
- `useExampleIds` loading: button shows spinner, disabled.
- `useExampleIds` errored: button disabled with tooltip "Unable to resolve example — check console"; the error is logged via `console.error`.

### Component responsibilities
- `AdminHelpPage.tsx` owns all filter/search state. Renders one `PageDirectorySection` per role group plus the `UndocumentedRoutesPanel` at the end.
- `PageDirectorySection.tsx` takes a role + its filtered entries; handles collapse state.
- `PageDirectoryRow.tsx` is presentational; takes the `PageEntry` and the pre-resolved navigation path as props.
- `UndocumentedRoutesPanel.tsx` is presentational; takes the `routeDiff` result.

This split keeps `AdminHelpPage` under ~200 lines and each sub-component focused on one responsibility.

---

## Parameterized Route Resolution

**Hook: `useExampleIds`**

One React Query key — `['admin-help', 'example-ids']` — with a 5-minute `staleTime`. On mount, fires 11 parallel `LIMIT 1` selects against the tables that own the parameterized IDs. Parent-child chains (trial → show, class → trial → show) are fetched with their parent IDs so that multi-param routes resolve to a consistent chain rather than a random combination.

```typescript
export function useExampleIds() {
  return useQuery({
    queryKey: ['admin-help', 'example-ids'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [show, trial, classRow, dog, club, role, template, person, entry, registration, user] =
        await Promise.all([
          supabase.from('shows').select('id').limit(1).maybeSingle(),
          supabase.from('trials').select('id, show_id').limit(1).maybeSingle(),
          supabase.from('classes').select('id, trial_id, show_id').limit(1).maybeSingle(),
          supabase.from('dogs').select('id').limit(1).maybeSingle(),
          supabase.from('clubs').select('id').limit(1).maybeSingle(),
          supabase.from('roles').select('id').limit(1).maybeSingle(),
          supabase.from('organization_templates').select('id').limit(1).maybeSingle(),
          supabase.from('people').select('id').limit(1).maybeSingle(),
          supabase.from('entries').select('id').limit(1).maybeSingle(),
          supabase.from('show_registrations').select('id').limit(1).maybeSingle(),
          supabase.from('profiles').select('id').limit(1).maybeSingle(),
        ]);
      return {
        showId: show.data?.id,
        trialId: trial.data?.id,
        trialShowId: trial.data?.show_id,
        classId: classRow.data?.id,
        classTrialId: classRow.data?.trial_id,
        classShowId: classRow.data?.show_id,
        dogId: dog.data?.id,
        clubId: club.data?.id,
        roleId: role.data?.id,
        templateId: template.data?.id,
        personId: person.data?.id,
        entryId: entry.data?.id,
        registrationId: registration.data?.id,
        userId: user.data?.id,
      };
    },
  });
}
```

**Resolver: `resolveExamplePath(pattern: string, ids: ExampleIds): string | null`**

Pure function. Substitutes `:param` tokens using a hard-coded pattern-to-id mapping. Returns `null` if any required ID is missing. Examples:

| Pattern | Resolution |
|---------|-----------|
| `/shows/:id` | `/shows/<ids.showId>` |
| `/shows/:showId/trials/:trialId` | `/shows/<ids.trialShowId>/trials/<ids.trialId>` |
| `/shows/:showId/trials/:trialId/classes/:classId` | `/shows/<ids.classShowId>/trials/<ids.classTrialId>/classes/<ids.classId>` |
| `/dogs/:id` | `/dogs/<ids.dogId>` |
| `/admin/permissions/roles/:roleId` | `/admin/permissions/roles/<ids.roleId>` |

Hard-coding the mapping is deliberate: it is explicit, testable, and makes it obvious which route uses which table. Auto-inference from param names is cleverer but fails on ambiguous cases (`:id` could be anything).

**Security:** only ID columns are selected, no sensitive data. Under existing RLS, SITE_ADMIN sees everything anyway. `maybeSingle()` tolerates empty tables without throwing. Eleven `LIMIT 1` queries in parallel complete in roughly 100ms on a warm connection and are cached for the rest of the session.

---

## Seeding `pageDirectory.ts`

Initial seeding is a one-afternoon effort, pulling from already-written sources:

1. **Routes** — enumerate `fullRouteRegistry` in `routeRegistry.ts`.
2. **Titles** — component names give good defaults (`BrowseShowsPage` → "Browse Shows", `PipelineDashboard` → "Pipeline (Mission Control)"); hand-curate ambiguous ones.
3. **Descriptions + classification** — lift directly from `docs/feature-audit-2026.md`, which already has a one-sentence rationale and classification label per route.
4. **Roles** — derive from route file location (`adminRoutes.tsx` → SITE_ADMIN, `secretaryRoutes.tsx` → SECRETARY + CLUB_ADMIN + SITE_ADMIN, etc.) plus journey references in `docs/journeys/*.md`.
5. **Categories** — seed from the conventional list above.
6. **Status** — default `working`; mark known stubs (e.g., `/admin/settings` flagged in the 2026-04-18 route audit) as `stub`.

The result is ~50 entries covering every entry in `fullRouteRegistry`.

---

## Testing

Per `CLAUDE.md` policy: unit tests for new components, hooks, and utilities.

**Unit tests (vitest):**
- `utils/routeDiff.ts` — given a mock registry and directory, returns the correct missing-routes set and extra-routes set.
- `utils/resolveExamplePath.ts` — pure function; 10-15 cases covering single-param, multi-param (chain consistency), missing-id (returns `null`), non-parameterized pass-through.
- `hooks/useExampleIds.ts` — mock Supabase; assert correct return shape, empty-table handling (`maybeSingle` returning `null`), error propagation.
- `pageDirectory.ts` invariant test — every `path` in `pageDirectory` must exist in `fullRouteRegistry`. This catches typos at test time.

**Component tests (vitest + RTL):**
- `AdminHelpPage` — renders sections by role; search filter narrows visible rows; role/category/classification/status filters apply AND logic; hide-parked and hide-hidden toggles work.
- `PageDirectoryRow` — "Go to" button enabled/disabled across each id-resolution state (resolved, loading, errored, missing).
- `UndocumentedRoutesPanel` — renders the provided diff; hidden when diff is empty.

**No E2E tests for v1.** The page is internal utility; component tests cover all interaction paths.

---

## Risks and Mitigations

- **Directory drift.** New routes will land in `routeRegistry.ts` without a matching `PageEntry`. The `UndocumentedRoutesPanel` surfaces this on every admin visit, turning drift into a visible nag. Stretch goal: a vitest invariant test or CI lint rule that fails when the diff is non-empty — blocks drift at PR time.
- **Component-name titles are sometimes poor.** `MyEntriesPage` is fine; `AnalyticsPage` is ambiguous between "platform analytics" and "my stats". Mitigation is hand-curation during seeding; the `title` field always overrides the component name.
- **Seeded descriptions age.** Pages can change intent without the description updating. Mitigation: the `feature-audit-2026.md` source is already a Phase 0 deliverable that the team commits to keeping current, and `pageDirectory.ts` can be regenerated from it. If descriptions become a maintenance burden in practice, switching to pulling them dynamically from a route-metadata decorator is a reasonable v2.

---

## Evolution Path

None of the v1 decisions block the anticipated next releases:

1. **Role-filtered help for non-admin users.** Flip the `RequireRole` gate, add `if (!entry.roles.includes(currentUser.highestRole)) return null;` to the row render. No schema change.
2. **Contextual drawer or command palette.** Reuse `PageDirectorySection` / `PageDirectoryRow` inside a side drawer or `cmdk` modal. The data and search logic are already componentized.
3. **Navigation flow diagram** (separate todo logged 2026-04-23). Adds a `linksTo: string[]` field to `PageEntry` and a new `PageFlowDiagram` view that reads the same directory.
4. **Screenshots / status badges from live telemetry.** Optional fields on `PageEntry`; no change to existing code paths.

---

## Open Questions Resolved During Brainstorm

- Q1 — Source of truth: **hybrid** (routeRegistry for drift detection + hand-authored directory for content).
- Q2 — Surface: **dedicated `/admin/help` page**.
- Q3 — Grouping: **by role, with classification as a filter**.
- Q4 — Entry schema: **core fields + category + status**.
- Q5 — Parameterized routes: **auto-resolve one representative ID chain per session**.
- Q6 — Access gate: **SITE_ADMIN only for v1**; data shape supports later role-filtered rollout.

---

## Acceptance Criteria

- [ ] `/admin/help` route exists, gated to SITE_ADMIN.
- [ ] `pageDirectory.ts` contains an entry for every route in `fullRouteRegistry`.
- [ ] Page renders role-grouped sections with collapse state persisted.
- [ ] Search + four filter dropdowns + two hide toggles work.
- [ ] Parameterized "Go to page" buttons resolve to a real chain of IDs and degrade gracefully when any table is empty.
- [ ] `UndocumentedRoutesPanel` is empty on first release (all routes documented) and renders drift correctly when a new unregistered route is added.
- [ ] Unit + component tests pass; invariant test catches any `path` typo.
- [ ] Sidebar "Help" entry visible to SITE_ADMIN only.

---

## Out of Scope (deferred)

- Navigation flow diagram (separate todo, logged 2026-04-23).
- Screenshots per page.
- Journey cross-references.
- Role-filtered UX for non-admin users.
- Keyword/synonym search.
- Global drawer / command palette.
- User-selectable example IDs.
- CI lint rule for drift (stretch; may be added during implementation if trivial).
