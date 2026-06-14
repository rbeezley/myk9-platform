# Club Admin Role — Implementation Plan

## Problem

When a new club joins the platform, the site admin (Richard) must manually grant roles to every secretary, chairman, etc. Secretaries are transient — they run one or two shows, then someone else takes over. The outgoing secretary shouldn't be responsible for onboarding their replacement. We need a self-sustaining delegation chain so the site admin only touches each club once.

## Design Decision

**Club Admin** is the stable role at a club. They're typically the club president or board member — someone who persists across shows and can hand off secretary duties season to season. The site admin onboards one club admin per club; everything else cascades from there.

## Role Hierarchy

```
Platform Admin (you)
  └── Club Admin (club president/board — persists across shows)
        └── Secretary (per-show — auto-granted on show assignment)
        └── Chairman (per-show — auto-granted on show assignment)
        └── Judge (per-show — already handled via judge picker)
```

## What Already Exists

| Component                                      | Status  | Location                 |
| ---------------------------------------------- | ------- | ------------------------ |
| `UserRole.CLUB_ADMIN` enum                     | Defined | `auth-types.ts:12`       |
| `is_club_admin(club_id)` RLS function          | Defined | `migrations/016`         |
| `<ClubAdminRoute>` route guard                 | Defined | `AuthContext.tsx:543`    |
| `user_roles` with `club_id` scope              | Defined | `migrations/005:251-261` |
| `club:manage_members` permission               | Defined | `auth-types.ts:83`       |
| `assignRole()` / `revokeRole()` in AuthContext | Defined | `AuthContext.tsx:50-95`  |
| Club admin dashboard UI                        | Missing | —                        |
| Auto-grant on show publish                     | Missing | —                        |
| Club member management UI                      | Missing | —                        |

## Implementation Phases

### Phase 1: Auto-Grant Roles on Show Publish

When the show creation wizard publishes a show, automatically ensure the assigned secretary and chairman have the correct app-level roles.

**Changes:**

- `useShowCreationWizardActions.ts` (publish handler): After saving the show, check if the assigned secretary/chairman has the `secretary`/`chairman` role. If not, call `assignRole()` with `club_id` scope.
- This is a Supabase Edge Function or direct `user_roles` insert — decide based on RLS. Since the person creating the show is already a secretary or club admin, they should have permission to grant these roles.

**RLS consideration:** The `user_roles` insert needs to be allowed for club admins and secretaries scoped to their club. Check if existing RLS policies on `user_roles` allow this, or add a policy.

**Files:**

- `apps/myk9show/src/hooks/useShowCreationWizardActions.ts`
- `apps/myk9show/src/services/database/queries/userQueries.ts` (add `ensureUserRole()`)
- Possibly `supabase/migrations/` (new policy on `user_roles` if needed)

### Phase 2: Club Admin Dashboard

A simple dashboard for club admins to manage their club's people and shows.

**Route:** `/club/:clubId/manage` (protected by `<ClubAdminRoute>`)

**Sections:**

1. **Club Members** — List of people with roles scoped to this club. Add/remove members, assign/revoke roles (secretary, chairman, steward). Uses existing `assignRole()`/`revokeRole()`.
2. **Club Shows** — List of shows for this club. Link to show details. Same data as secretary dashboard but scoped to club.
3. **Club Profile** — Edit club name, logo, contact info. Links to per-show branding (future).

**UI approach:** Reuse `createRoleLayout` factory + `RoleSidebar` pattern from judge/exhibitor dashboards.

**Files (new):**

- `apps/myk9show/src/pages/club-admin/ClubAdminDashboard.tsx`
- `apps/myk9show/src/pages/club-admin/ClubMembersPage.tsx`
- `apps/myk9show/src/pages/club-admin/ClubShowsPage.tsx`
- `apps/myk9show/src/components/layout/sidebar/club-admin-sidebar-config.ts`
- `apps/myk9show/src/routes/clubAdminRoutes.tsx`

**Files (modified):**

- `apps/myk9show/src/App.tsx` (add club admin routes)
- `apps/myk9show/src/components/layout/sidebar/UnifiedSidebar.tsx` (add club admin nav items)

### Phase 3: Platform Admin Club Onboarding

Streamline the one-time setup: platform admin creates a club and assigns its first club admin.

**Changes:**

- Admin console's club creation flow should prompt for "Club Admin" (person picker + role grant in one step)
- If the club admin person doesn't exist yet, inline-create them (same pattern as wizard's "Create New" buttons)

**Files:**

- `apps/myk9show/src/pages/admin/` (existing admin pages — add club admin assignment)
- Possibly `apps/myk9show/src/components/panels/entities/ClubCreationPanel.tsx` (add club admin field)

### Phase 4: Secretary Dashboard Scoping

Currently the secretary dashboard shows all shows. Scope it so secretaries only see shows for clubs they're associated with.

**Changes:**

- `useMissionControlData.ts`: Filter shows by the secretary's `club_id` from their `user_roles` entry
- If a secretary has roles scoped to multiple clubs, show all their clubs' shows

**Files:**

- `apps/myk9show/src/features/pipeline/hooks/useMissionControlData.ts`
- `apps/myk9show/src/services/database/queries/showQueries.ts`

## User Stories

### Site Admin (Richard)

1. New club signs up → I create the club and assign one person as Club Admin → Done, never touch that club again

### Club Admin (Club President)

1. New season → I pick Jane as secretary for our next show → Jane automatically gets secretary access
2. Jane steps down → I pick Bob for the next show → Bob gets access, Jane keeps hers (harmless, she just won't have shows to manage)
3. I can see all my club's shows and members in one place

### Secretary (Jane)

1. I'm assigned as secretary → I can immediately access the Secretary Dashboard and see my club's shows
2. I create a show → I pick officials → They get auto-granted if needed
3. Next season someone else takes over → I still have my account, just no active shows

## Rollout Order

1. **Phase 1 first** — Auto-grant is the highest-value, lowest-effort change. Eliminates the manual role-granting bottleneck immediately.
2. **Phase 2 next** — Club admin dashboard gives club admins visibility and control.
3. **Phase 3 when needed** — Admin onboarding polish. You can do this manually via Supabase dashboard until the UI exists.
4. **Phase 4 later** — Scoping is nice-to-have. Currently harmless that secretaries see all shows (small user base).

## Non-Goals

- **Role revocation on show completion** — Don't auto-revoke secretary role when a show ends. The role is harmless to keep and avoids confusion.
- **Club membership independent of roles** — Keep the current model where "member of club X" = "has any role scoped to club X." No separate membership table needed yet.
- **Multi-club support for club admins** — Support it technically (multiple `user_roles` rows with different `club_id`), but don't build special UI for it yet.
