# Tasks — admin-bulk-role-assignment (MYK9-58)

## 1. Shared role vocabulary

- [ ] 1.1 Create `apps/myk9show/src/services/rbac/roleUiConstants.ts` exporting
      `MANAGEABLE_ROLES`, `CLUB_SCOPED_ROLES`, `LOCKED_ROLES`, `ROLE_LABELS` (moved
      verbatim from `ManageUserRolesDialog.tsx`); switch `ManageUserRolesDialog` to import
      them. No behavior change to the single-user dialog.
- [ ] 1.2 Test pinning the shared constants: manageable set equals the canonical seven
      role names, club-scoped = secretary + club_admin, locked = exhibitor.

## 2. Bulk role dialog + dispatch

- [ ] 2.1 New `components/admin/users/BulkRoleDialog.tsx` per design: mode
      Add/Remove/Replace, role checkboxes from shared constants (locked roles disabled in
      add, absent in remove), club badge+Select block (same `clubs-list` query as the
      single-user dialog) required when any selected role is club-scoped, Replace-mode
      destructive copy.
- [ ] 2.2 `useBulkActions.ts`: add `handleBulkRoleChange(users, config)` dispatching
      per-user via `useBulkDispatch` — pre-dispatch validation of selected role names
      against `rbacService.getAllRoles()` (unknown → reject batch with visible error, no
      dispatch); Add via `ensureUserHasRole` (+`{clubId}` per chosen club for scoped
      roles, `false` = skip-already-assigned); Remove via `revokeRole` (scoped variants
      per club); Replace = validate → revoke non-locked/non-target (using the user's
      active assignments) → add. Per-user invalidation of `['user-roles', id]` and
      `['user-role-assignments', id]` inside the runner. Retry `applicableWhen`: user
      still in the current admin list.
- [ ] 2.3 `BulkActionsBar.tsx`: add the "Change roles" button + `'role'` dialog type,
      render `BulkRoleDialog`, wire `onBulkComplete`/selection-clear on full success
      (matching delete). Keep the file under 500 lines.
- [ ] 2.4 Component/hook tests proving: canonical values dispatched (no admin/handler
      possible); scoped role without a club cannot submit; scoped grants carry `clubId`;
      `ensureUserHasRole` false → user reported skipped, thrown error → failed, summary
      honest on partial failure; Replace validates before revoking and preserves
      exhibitor; retry skips users no longer in the list; duplicate dispatch latched.

## 3. Verification and ship gate

- [ ] 3.1 Focused suites green: new tests + existing `useBulkActions.test.ts`,
      `BulkActionsBar.test.tsx`, `ManageUserRolesDialog` coverage if present,
      `UserManagementPage` suites.
- [ ] 3.2 `pnpm typecheck --force`, `pnpm lint` (`--max-warnings 0` on touched files),
      `pnpm qa:code-quality-ratchet` not regressed.
- [ ] 3.3 Browser verification as a site admin on a worktree dev server: bulk-add
      secretary with a club to two users (verify `user_roles` rows carry `club_id`),
      remove it again, replace preserving exhibitor; confirm honest summary on a forced
      failure if practical.
- [ ] 3.4 PR, CI green, Codex second-opinion review, merge to main (gate for archive).
- [ ] 3.5 Linear MYK9-58 Done on merge; archive with `archive-summary.md` (PR URL + merge
      evidence), fill any TBD Purpose, stage both halves of the archive move.
