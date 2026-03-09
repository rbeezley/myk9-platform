# Club Admin Show Access — Fix Delegation Flow

## Problem

Club admins can assign officer positions (club governance) but cannot grant **show management access** (RBAC SECRETARY role). The show creation wizard also shows all clubs to all secretaries, with no scoping.

## Design Decision

- **Club Secretary** (officer position in `club_officers`) = club governance title, no app permissions
- **Show Manager** (RBAC `SECRETARY` role scoped to club) = app permission to create/manage shows
- These are separate concepts. A club admin grants show access explicitly via the members page.

## Changes

### 1. Add show access management to ClubMembersPage

- Query `user_role_assignments` to find who has SECRETARY role scoped to this club
- Show "Show Manager" badge on members who have show access
- Add "Grant Show Access" / "Revoke Show Access" to MemberActionMenu
- Grant calls `rbacService.ensureUserHasRole(personId, 'secretary', clubId)`
- Revoke calls `rbacService.revokeRole({ userId: personId, roleName: 'secretary', scopeId: clubId })`

**Files modified:**

- `apps/myk9show/src/pages/club-admin/ClubMembersPage.tsx`
- `apps/myk9show/src/pages/club-admin/ClubMemberDialogs.tsx`
- `apps/myk9show/src/services/database/queries/clubMembershipQueries.ts`

### 2. Scope show wizard club selection to secretary's clubs

- In ShowDetailsStep, get user's club scopes from auth context
- For non-admin users, filter clubs to only those they have SECRETARY or CLUB_ADMIN role for
- Auto-select club if user has exactly one
- Platform admins continue to see all clubs

**Files modified:**

- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`

## Testing

- Typecheck + lint
- Verify no regressions in existing tests
