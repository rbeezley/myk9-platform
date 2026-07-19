# Rebuild Admin Bulk Role Assignment with Canonical Values + Club Scope (MYK9-58)

## Why

The admin Users bulk "Change roles" action was removed in MYK9-47 (PR #1376) because it was
silently broken: its hardcoded role options included `admin` and `handler` (neither exists
in the canonical `roles` table — the real name is `site_admin` and there is no handler
role), it ignored `ensureUserHasRole`'s boolean result so "Add" reported success while
assigning nothing, "Replace" could deactivate every existing role and then add none, and it
had no club selector so club-scoped roles failed the DB guard silently. MYK9-47's contract
was "real or absent," so it was removed. This change rebuilds it correctly. Fall 2026
launch readiness: admins onboarding club staff (secretaries, club admins) need to grant
roles to groups of people without opening seven dialogs.

## Duplication question

Does this duplicate an existing surface? **No — and it consolidates one.** The single-user
editor `ManageUserRolesDialog` (components/admin/permissions/) is already the canonical
role-editing model: canonical role list, `CLUB_SCOPED_ROLES`, locked `exhibitor`,
`rbacService.assignRole`/`revokeRole` with club scope. The bulk dialog reuses that
vocabulary — the role/label/scoped/locked constants are extracted to one shared module both
dialogs import — and adds only the bulk mode selector and multi-user dispatch. No new page;
the dialog hangs off the existing `BulkActionsBar` on the existing admin Users page, next
to bulk delete.

## What changes

- Extract `MANAGEABLE_ROLES`, `CLUB_SCOPED_ROLES`, `LOCKED_ROLES`, `ROLE_LABELS` from
  `ManageUserRolesDialog` into a shared `services/rbac/roleUiConstants.ts` (single source;
  the single-user dialog switches to importing them).
- New `BulkRoleDialog` on the admin Users bulk bar: mode selector (Add / Remove / Replace),
  role checkboxes from the shared manageable list, and a club multi-select (same
  badge-plus-Select pattern as the single-user dialog) that appears when any selected role
  is club-scoped.
- New `handleBulkRoleChange` in `components/admin/users/useBulkActions.ts` dispatching
  per-user through `useBulkDispatch` (honest partial-failure summary + retry + in-flight
  latch), calling `rbacService` with explicit club scope and honoring boolean results —
  never silent success.
- Replace mode preserves locked roles (`exhibitor`) exactly as the single-user editor does.

## Non-goals

- No changes to `rbacService` / `RoleManager` semantics, no migrations, no RLS changes.
- No show-scoped role assignment (service supports `showId`, but no admin UI offers it
  today — parity with the single-user dialog).
- No rework of `UserDetailsDialog`'s legacy roles tab (pre-existing surface; flagged for
  future consolidation with `ManageUserRolesDialog`, out of scope here).
- No bulk account-status action (separately removed stub; not part of this issue).

## Impact

- Specs: `bulk-selection-actions` (added requirement for canonical, scope-aware bulk role
  assignment on the admin Users surface).
- Code: `apps/myk9show/src/components/admin/users/` (BulkActionsBar, useBulkActions, new
  BulkRoleDialog), `components/admin/permissions/ManageUserRolesDialog.tsx` (import shared
  constants), new `services/rbac/roleUiConstants.ts`, plus tests.
- No migrations, no edge functions, no deploys.
