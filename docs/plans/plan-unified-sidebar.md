# Plan: Unified Adaptive Sidebar Navigation

**Status:** Draft
**Created:** 2026-03-06

## Problem

Two competing navigation systems create a fractured UX:

1. **Top nav (AppHeader)** — role-aware links (Shows, Dogs, People, Clubs, Dashboard) visible on all pages
2. **Role sidebars** — 4 separate sidebar configs for Judge, Exhibitor, Secretary, Admin, each with their own layout wrapper

Pain points:

- Context switch between sidebar pages and standalone browse pages (different layout, different nav)
- `EmbeddedPageWrapper` hack strips page chrome to force browse pages into sidebar layouts
- Duplicate routes: BrowseShowsPage rendered at `/shows`, `/judge/shows`, `/secretary/shows`
- AppHeader role-switching logic duplicates what sidebars already handle
- Users with multiple roles must navigate to different URL prefixes (`/judge/*` vs `/secretary/*`)

## Solution

Replace the top nav page links + 4 per-role sidebars with **one unified sidebar** that adapts sections based on the user's roles. The top bar becomes a thin utility strip (logo, search, theme, notifications, avatar).

## Target Layout

```
+----------------------------------------------------------+
| [Logo]              [Search Cmd+K] [Theme] [Bell] [Avatar] |  <- thin top bar
+----------+-----------------------------------------------+
| BROWSE   |                                               |
|  Shows   |   (page content, full width)                  |
|  Dogs    |                                               |
|  People  |                                               |
|  Clubs   |                                               |
|  Calendar|                                               |
|          |                                               |
| JUDGING  |  <- only if user has judge role               |
|  Dashboard|                                              |
|  My Stats|                                               |
|  Check-In|                                               |
|          |                                               |
| MY SHOWS |  <- only if user has exhibitor role           |
|  Dashboard|                                              |
|  My Entries|                                             |
|  My Dogs |                                               |
|          |                                               |
| MANAGE   |  <- only if secretary/club_admin              |
|  Pipeline|                                               |
|  Create Show|                                            |
|  Entries |                                               |
|  Run Orders|                                             |
|          |                                               |
| ADMIN    |  <- only if site_admin                        |
|  Dashboard|                                              |
|  Users   |                                               |
|  Roles   |                                               |
|  Templates|                                              |
|  Analytics|                                              |
|  System  |                                               |
|          |                                               |
| -------- |                                               |
| Settings |                                               |
| Help     |                                               |
+----------+-----------------------------------------------+
```

## Design Decisions

### URL structure

**Keep role prefixes for RBAC gating but render all inside the unified layout.**

- `/shows`, `/dogs`, `/people`, `/clubs`, `/calendar` — public/browse (no role required)
- `/judge/dashboard`, `/judge/stats`, `/judge/check-in` — judge role required
- `/exhibitor/dashboard`, `/exhibitor/entries` — exhibitor role required
- `/secretary/dashboard`, `/secretary/create-show`, etc. — secretary role required
- `/admin/dashboard`, `/admin/users`, etc. — admin role required

Role prefixes are useful for RBAC route guards (`ProtectedRoute`) and for bookmarking/sharing. No need to flatten them.

### Sidebar behavior

- **Desktop:** Collapsible to icon rail (hover to expand), default expanded. Matches existing `createRoleLayout` behavior.
- **Mobile:** Hidden by default, hamburger button in top bar opens as overlay. Same as current.
- **Unauthenticated:** Show only Browse section. No sidebar collapse (always expanded on desktop since it's small).

### What happens to the top nav

The AppHeader shrinks to a **utility bar**:

- Left: Logo/brand (links to home)
- Right: Command palette trigger (Cmd+K), theme toggle, notifications bell, shopping cart badge, user avatar/dropdown
- **No page links** in the top bar. All navigation moves to the sidebar.
- Keep keyboard shortcuts (G+D, G+S, etc.) — they navigate regardless of nav UI.

### Scoring pages

Judge scoring pages (`/judge-scoring`, `/scoring/*`, `/shows/.../judge`) remain **full-screen with no sidebar**. These are immersive interfaces where the judge needs maximum screen space. They already render outside role layouts today — no change needed.

## Implementation Phases

### Phase 1: UnifiedSidebar config + component

**Files to create:**

- `src/components/layout/sidebar/unifiedSidebarConfig.ts` — builds sidebar config from user roles
- `src/components/layout/UnifiedSidebar.tsx` — renders the adaptive sidebar

**How it works:**

```typescript
// unifiedSidebarConfig.ts
function buildUnifiedSidebarConfig(userRoles: UserRole[]): SidebarConfig {
  const groups: NavGroup[] = [];

  // Always show Browse
  groups.push({
    title: 'Browse',
    items: [
      { title: 'Shows', href: '/shows', icon: Calendar },
      { title: 'Dogs', href: '/dogs', icon: Heart },
      { title: 'People', href: '/people', icon: Users },
      { title: 'Clubs', href: '/clubs', icon: Building2 },
      { title: 'Calendar', href: '/calendar', icon: CalendarDays },
    ],
  });

  // Exhibitor section (most users)
  if (hasRole(userRoles, [EXHIBITOR, ...])) {
    groups.push({
      title: 'My Shows',
      items: [
        { title: 'Dashboard', href: '/exhibitor/dashboard', icon: LayoutDashboard },
        { title: 'My Entries', href: '/exhibitor/entries', icon: FileText },
        { title: 'My Dogs', href: '/dogs', icon: Heart },  // or /exhibitor/dogs if filtered
      ],
    });
  }

  // Judge section
  if (hasRole(userRoles, [JUDGE])) {
    groups.push({
      title: 'Judging',
      items: [
        { title: 'Dashboard', href: '/judge/dashboard', icon: LayoutDashboard },
        { title: 'My Stats', href: '/judge/stats', icon: BarChart3 },
        { title: 'Check-In', href: '/judge/check-in', icon: ClipboardCheck },
      ],
    });
  }

  // Secretary section
  if (hasRole(userRoles, [SECRETARY, CLUB_ADMIN])) {
    groups.push({
      title: 'Manage',
      items: [
        { title: 'Pipeline', href: '/secretary/dashboard', icon: LayoutDashboard },
        { title: 'Create Show', href: '/secretary/create-show', icon: Plus },
        { title: 'Entries', href: '/secretary/entries', icon: FileText },
        { title: 'Run Orders', href: '/secretary/run-order', icon: List },
      ],
    });
  }

  // Admin section
  if (hasRole(userRoles, [SITE_ADMIN])) {
    groups.push({
      title: 'Admin',
      items: [
        { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
        { title: 'Users', href: '/admin/users', icon: Users },
        { title: 'Roles & Permissions', href: '/admin/permissions', icon: Shield },
        { title: 'Templates', href: '/admin/templates', icon: FileText },
        { title: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
        { title: 'System', href: '/admin/sync', icon: RefreshCw },
      ],
    });
  }

  return { groups, dashboardHref: '/shows', /* ... */ };
}
```

The existing `RoleSidebar` component and `SidebarConfig` type work as-is — we just feed them a unified config instead of per-role configs.

**Estimated scope:** 2 new files, ~150 lines total.

### Phase 2: UnifiedAppLayout

**Files to create:**

- `src/components/layout/UnifiedAppLayout.tsx` — replaces AppLayout as the root layout

**What it does:**

- Renders the thin top bar (slimmed-down AppHeader)
- Renders UnifiedSidebar using `SidebarLayout`
- Renders `<Outlet />` for page content
- Reads user roles from `useAuthContext()` and passes to sidebar config builder

```typescript
const UnifiedAppLayout: React.FC = () => {
  const { user, getUserRoles } = useAuthContext();
  const roles = getUserRoles();
  const sidebarConfig = useMemo(() => buildUnifiedSidebarConfig(roles), [roles]);

  return (
    <>
      <SlimAppHeader />  {/* logo + search + theme + notifications + avatar */}
      <SidebarLayout
        sidebar={<RoleSidebar config={sidebarConfig} />}
        sidebarWidth={240}
        collapsedWidth={56}
        isCollapsible
        isCollapsed
        hoverToExpand
      >
        <Outlet />
      </SidebarLayout>
    </>
  );
};
```

**Estimated scope:** 1 new file (~80 lines), 1 modified file (AppHeader slim-down).

### Phase 3: Flatten route structure

**Goal:** All routes render inside `UnifiedAppLayout` instead of per-role layouts.

**Changes:**

1. In the root router, wrap all routes (except scoring full-screen routes) inside `<UnifiedAppLayout>`:

```tsx
<Route element={<UnifiedAppLayout />}>
  {/* Browse routes (public) */}
  <Route path="/shows" element={<BrowseShowsPage />} />
  <Route path="/dogs" element={<BrowseDogsPage />} />
  {/* ... */}

  {/* Judge routes (protected) */}
  <Route path="/judge/dashboard" element={<ProtectedRoute requiredRole={JUDGE}><JudgeDashboard /></ProtectedRoute>} />
  {/* ... */}

  {/* Secretary routes (protected) */}
  {/* ... */}

  {/* Admin routes (protected) */}
  {/* ... */}
</Route>

{/* Scoring routes — NO sidebar, full screen */}
<Route path="/judge-scoring" element={...} />
<Route path="/scoring/*" element={...} />
```

2. **Remove** per-role layout wrappers (`JudgeLayout`, `ExhibitorLayout`, `SecretaryLayout`, `AdminLayout`) from route definitions.

3. **Remove** all `EmbeddedPageWrapper` usage — pages no longer need chrome-stripping since they'll always render inside the sidebar layout.

4. **Remove** duplicate route registrations (e.g., `/judge/shows` and `/secretary/shows` — just use `/shows`).

5. **Update page components:** Remove `min-h-screen` and `py-20` from browse pages (the sidebar layout handles full-height and padding). This is the cleanup that `EmbeddedPageWrapper` was papering over.

6. **[ADDED] Detail pages inside UnifiedAppLayout:** All detail pages (`/shows/:id`, `/dogs/:id`, `/users/:id`, `/clubs/:id`) render inside `UnifiedAppLayout` — they are browse-adjacent and benefit from persistent sidebar navigation.

7. **[ADDED] Secretary standalone routes:** These 4 routes currently render outside SecretaryLayout and should be placed inside `UnifiedAppLayout` with appropriate `ProtectedRoute` guards:
   - `/trials/:trialId/classes/create` → `ClassCreationPage` (secretary/club_admin/site_admin)
   - `/trials/:trialId/classes` → `ClassManagementPage` (secretary/club_admin/site_admin)
   - `/shows/:showId/trials/:trialId/classes/:classId/secretary` → `SecretaryClassDashboard` (secretary/club_admin/site_admin)
   - `/sync/dashboard` → `SyncDashboardPage` (site_admin)

8. **[ADDED] Results dashboard route:** `/results/dashboard` (currently standalone outside JudgeLayout) moves inside `UnifiedAppLayout` with its existing role guard (judge/secretary/site_admin).

9. **[ADDED] Content padding strategy:** The unified layout does NOT use `contentWrapper`. Pages are responsible for their own max-width and padding (via their existing `container mx-auto` classes). This matches how browse pages already work and avoids the inconsistency where ExhibitorLayout added `contentWrapper: true` but other layouts didn't. Pages that relied on ExhibitorLayout's `contentWrapper` (e.g., ExhibitorDashboard) should add their own `max-w-7xl mx-auto px-4 py-6` if they don't already have it.

**Route deduplication:**

| Current duplicate routes                                        | Keep        | Remove                              |
| --------------------------------------------------------------- | ----------- | ----------------------------------- |
| `/shows` + `/judge/shows` + `/secretary/shows`                  | `/shows`    | `/judge/shows`, `/secretary/shows`  |
| `/people` (via `/users`) + `/judge/people` + `/secretary/users` | `/people`   | `/judge/people`, `/secretary/users` |
| `/dogs` + `/secretary/dogs`                                     | `/dogs`     | `/secretary/dogs`                   |
| `/clubs` + `/secretary/clubs`                                   | `/clubs`    | `/secretary/clubs`                  |
| `/calendar` + `/secretary/calendar`                             | `/calendar` | `/secretary/calendar`               |

**Sidebar links update:** The Judging section's "Shows" and "People" links point to `/shows` and `/people` (the browse pages), not role-prefixed versions.

**Estimated scope:** Modify 4 route files, delete `EmbeddedPageWrapper`, update ~6 page components to remove standalone chrome.

### Phase 4: Slim down AppHeader

**Goal:** Remove page navigation links from the header, keep only utility controls.

**Changes to AppHeader.tsx:**

- Remove the role-based nav link arrays and `renderRoleBasedNavigation()` function
- Remove the `<nav>` element rendering those links
- **[ADDED]** Delete the 4 navigation component files: `components/layout/navigation/{AdminNavigation,SecretaryNavigation,JudgeNavigation,ExhibitorNavigation}.tsx`
- Keep: logo, command palette button, theme toggle, notifications, cart badge, user avatar/dropdown
- Reduce header height from 64px to ~48px (utility bar)
- Keep keyboard shortcuts (G+D, G+S, etc.) — they're global, independent of nav UI

**Estimated scope:** ~100 lines removed from AppHeader, minor height/padding tweaks.

### Phase 5: Cleanup

**Delete:**

- `components/judge/JudgeLayout.tsx`
- `components/judge/JudgeSidebar.tsx`
- `components/exhibitor/ExhibitorLayout.tsx`
- `components/exhibitor/ExhibitorSidebar.tsx`
- `components/secretary/SecretaryLayout.tsx`
- `components/secretary/SecretarySidebar.tsx`
- `components/admin/AdminLayout.tsx`
- `components/admin/AdminSidebar.tsx`
- `components/layout/sidebar/createRoleLayout.tsx` (replaced by UnifiedAppLayout)
- `EmbeddedPageWrapper` definitions in route files
- **[ADDED]** `components/layout/navigation/AdminNavigation.tsx`
- **[ADDED]** `components/layout/navigation/SecretaryNavigation.tsx`
- **[ADDED]** `components/layout/navigation/JudgeNavigation.tsx`
- **[ADDED]** `components/layout/navigation/ExhibitorNavigation.tsx`

**Update:**

- `components/layout/sidebar/index.ts` — remove old exports, add new ones
- `routes/routeRegistry.ts` — remove duplicate route component mappings
- Any imports referencing deleted files
- **[ADDED]** Pages that relied on ExhibitorLayout's `contentWrapper` — add `max-w-7xl mx-auto px-4 py-6` wrapper if missing

**Keep:**

- `components/layout/sidebar/RoleSidebar.tsx` — reused by UnifiedSidebar
- `components/layout/sidebar/types.ts` — SidebarConfig type unchanged
- `components/layout/sidebar/useActivePath.ts` — active path detection unchanged
- `components/layout/SidebarLayout.tsx` — the layout shell, unchanged

**Estimated scope:** Delete ~12 files (8 sidebar/layout + 4 navigation components), update ~5 import references.

## Migration Strategy

Phases 1-2 can be built alongside the existing system (new files, no breaking changes). Phase 3 is the big switch — done in one commit, swapping the route structure. Phase 4 follows immediately. Phase 5 is cleanup.

Total estimated file changes: ~22 files modified, ~12 files deleted, ~3 files created.

## Risks and Mitigations

| Risk                                                                       | Mitigation                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse pages have `min-h-screen` + `py-20` that looks wrong inside sidebar | Phase 3 removes this; test each page visually                                                                                                     |
| Active path detection breaks with flattened routes                         | `useActivePath` already handles prefix matching; test thoroughly                                                                                  |
| Admin sidebar was non-collapsible by design                                | Unified sidebar is collapsible; admin items are just another section. If admin needs more space, we can auto-expand when navigating to `/admin/*` |
| Unauthenticated users see empty sidebar                                    | Show Browse section only; sidebar is useful for them too (Shows, Clubs are public)                                                                |
| Scoring pages accidentally get sidebar                                     | Keep scoring routes outside `UnifiedAppLayout` wrapper                                                                                            |
| **[ADDED]** ExhibitorLayout `contentWrapper` padding lost                  | Pages that relied on it add their own `max-w-7xl mx-auto` wrapper; verify ExhibitorDashboard, MyEntriesPage, ClassCheckIn                         |
| **[ADDED]** Secretary standalone routes (class creation, sync) orphaned    | Wrap in `UnifiedAppLayout` with existing `ProtectedRoute` guards — they're management pages that benefit from sidebar                             |
| **[ADDED]** Admin sidebar width regression (288px → 240px)                 | Accept standard 240px width; admin items have descriptions but they show on hover/expand anyway                                                   |

## Out of Scope

- Changing the sidebar visual design (icons, colors, animations) — keep current look
- Adding new nav items or pages — just reorganizing existing ones
- Changing URL paths (except removing duplicates) — bookmarks and links stay valid
- myK9Q changes — this is myK9Show only
