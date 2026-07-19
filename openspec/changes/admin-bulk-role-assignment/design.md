# Design — admin-bulk-role-assignment (MYK9-58)

## Context

MYK9-47 left the admin Users surface with bulk delete only; the broken bulk role dialog was
deleted (`ea1621bf7`). The single-user `ManageUserRolesDialog` (admin/permissions) is the
correct model: role options from the RBAC layer, `CLUB_SCOPED_ROLES = {secretary,
club_admin}`, `LOCKED_ROLES = {exhibitor}`, assignment via `rbacService.assignRole({...,
scopeType:'club', scopeId})` and removal via `rbacService.revokeRole(...)`.

## Offline-first / replication impact

None. Admin RBAC management is an online-admin surface (direct Supabase via `rbacService`,
same as the single-user dialog); no replicated tables are involved. This matches the
existing admin Users page behavior (bulk delete is also direct).

## Shared vocabulary extraction

New `apps/myk9show/src/services/rbac/roleUiConstants.ts` exporting `MANAGEABLE_ROLES`,
`CLUB_SCOPED_ROLES`, `LOCKED_ROLES`, `ROLE_LABELS` (moved verbatim from
`ManageUserRolesDialog.tsx`, which now imports them). Both dialogs render from the same
list — the non-canonical `admin`/`handler` failure class becomes structurally impossible.
Role *ids* are still resolved at save time via `rbacService.getAllRoles()`; if a selected
role name is somehow absent from the table, that user-item fails loudly (never skipped
silently).

## Bulk dialog semantics (`BulkRoleDialog`)

State: `mode: 'add' | 'remove' | 'replace'`, `selectedRoles: Set<roleName>`,
`clubIds: string[]` (shown when any selected role is club-scoped; required non-empty to
submit in add/replace modes — remove mode also scopes club-scoped revocations to the chosen
clubs).

Per-user work unit (dispatched via `useBulkDispatch<SelectedUser>`; per-item = per user):

- **Add**: for each selected role — unscoped: `ensureUserHasRole(userId, roleName)`;
  club-scoped: `ensureUserHasRole(userId, roleName, { clubId })` per chosen club.
  `ensureUserHasRole` returns `false` for "already has this active role" (a no-op skip,
  fine in bulk-add) and throws on real errors, which fail that user honestly. Because role
  names come from the canonical shared list AND ids are verified against
  `getAllRoles()` before dispatch, the old "false meant the role doesn't exist" failure
  class is pre-checked: unknown role → the whole batch is rejected before dispatch with a
  visible error, not a per-item false.
- **Remove**: for each selected role — unscoped: `revokeRole({ userId, roleName })`;
  club-scoped: `revokeRole({ userId, roleName, scopeType:'club', scopeId: clubId })` per
  chosen club. `revokeRole` returning `false` (nothing to revoke) is a no-op skip.
  Locked roles (`exhibitor`) are not offered in remove/replace-removal.
- **Replace**: fetch the user's active assignments (same query shape as the single-user
  dialog), revoke everything not locked and not in the target set (club-scoped: revoke all
  existing club scopes not in the chosen clubs), then run Add. Revokes happen only after
  the target roles are validated against `getAllRoles()` — the old "deactivate everything
  then add nothing" failure is impossible by ordering: validate → revoke → add, and any
  throw fails that user with the partial-failure summary naming them.

Duplicate dispatch: `useBulkDispatch`'s in-flight latch. Retry: per-run `applicableWhen`
keeps a user eligible only while still present in the current admin users list (deleted
users skip as "no longer eligible"). Selection clears only on full success (existing
`onFullSuccess` wiring, as bulk delete does).

## UI composition

`BulkActionsBar` gains a "Change roles" button (visible alongside Delete) opening
`BulkRoleDialog` (`DialogType` union gains `'role'` again). The dialog mirrors the
single-user layout: mode `Select` on top, role checkbox list (locked roles shown disabled
in add mode, hidden in remove), club badge+Select block when a scoped role is selected
(clubs from the same `clubs-list` query the single-user dialog uses), destructive-styled
copy for Replace mode stating it removes non-locked roles not in the new set. Keep
`BulkActionsBar.tsx` under 500 lines by making `BulkRoleDialog` its own file owning all
dialog state.

## Feedback + cache refresh

Per-user success/failure flows through `useBulkDispatch`'s summary toast ("n of m
succeeded" + retry). After each successful user, invalidate `['user-roles', userId]` and
`['user-role-assignments', userId]` (both single-user dialogs' keys) inside the per-item
runner so toast retries stay fresh; after the batch, `onBulkComplete` already lets the
page `refetch` the admin list.

## Emotional intent

Admin surface: professional, honest, reversible. No optimistic "roles updated" until the
per-user results are in; failures name the user and stay retryable; Replace mode says
exactly what it will remove before the admin commits.

## Risks

- Replace across many users multiplies RBAC round-trips (validate + revoke + add per
  user). Accepted: admin-scale batches are small; `useBulkDispatch` runs items via
  `Promise.allSettled` and reports honestly.
- `ensureUserHasRole(false)` conflates "already assigned" with other soft-nos at the
  service layer; the pre-dispatch canonical-list validation removes the dangerous case
  (unknown role), leaving "already assigned," which is legitimately a skip in bulk-add.
  Documented in code comment.
