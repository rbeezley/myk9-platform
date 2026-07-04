## 1. Map read paths (required before any SQL)

- [x] 1.1 Grep `apps/myk9show/src/services/rbac/**` and
      `apps/myk9show/src/context/AuthContext.tsx` for direct reads of
      `user_roles`/`roles`/`permissions`/`role_permissions` vs. a
      `SECURITY DEFINER` RPC (`getUserPermissions`, `get_user_roles`, etc.)
      — **Self-resolution goes through SECURITY DEFINER RPCs**
      (`PermissionChecker.getUserPermissions` → `get_user_roles` /
      `get_user_permissions`, mig 017/065, bypass RLS). Tightening `user_roles`
      SELECT will NOT break login. Current SELECT policy is still
      `user_roles_select USING (true)` from mig 006 (079 only touched I/U/D).
- [x] 1.2 Check whether any admin surface (`/admin/permissions/*`,
      `/admin/users`, role-request screens) lists other users' roles, and
      confirm it's already client-gated to admins — admin reads
      (`useAllUsersWithRoles`, `UserDetailsDialog`, `ManageUserRolesDialog`)
      are admin-route gated; they rely on the `is_site_admin()` read clause.
- [x] 1.3 Determine whether the frontend needs the `roles`/`permissions`
      catalog outside admin surfaces — YES: `useShowOfficials`/`useEntryFormData`
      read the `roles` catalog (`.in('name', OFFICIAL_ROLES)`) to resolve
      official role ids; `roles`/`permissions`/`role_permissions` stay readable
      to `authenticated` (deny `anon`), not admin-only.
- [x] 1.3b **Cross-user non-admin reads of `user_roles`** (would break under
      self-or-admin): `useShowOfficials`/`getShowOfficials` (by `show_id`;
      exhibitor + public show pages, reports), `useEntryFormData` secretary
      lookup (by `show_id`; exhibitor entry blank), `getClubShowManagerIds`
      (by `club_id`; club-admin). Decision: route these through new
      `SECURITY DEFINER` RPCs so the base table can be scoped self-or-admin.
- [x] 1.4 Record the map in the PR description as justification for the chosen
      scope

## 2. Write failing policy tests (red)

- [x] 2.1 SQL/pgTAP or Deno test: exhibitor JWT SELECT on `user_roles` returns
      only own rows (currently all rows → red)
- [x] 2.2 SQL/pgTAP or Deno test: exhibitor SELECT on `permission_audit_log`
      returns 0 rows (currently all rows → red)
- [x] 2.3 SQL/pgTAP or Deno test: site-admin JWT retains full read on all five
      tables (regression guard, should already pass)

## 3. Implement the scoped migration

- [x] 3.1 Write `<ts>_restrict_rbac_role_map_select.sql`: DROP the five
      `USING (true)` SELECT policies
- [x] 3.2 CREATE scoped `user_roles` SELECT policy
      (`auth_user_id = auth.uid() OR is_site_admin()`, or admin-only if mapping
      shows self-resolution uses a `SECURITY DEFINER` RPC)
- [x] 3.3 CREATE `is_site_admin()`-only SELECT policy for `permission_audit_log`
- [x] 3.4 CREATE `TO authenticated USING (true)` SELECT policies for
      `roles`/`permissions`/`role_permissions` (deny `anon`; catalog still needed
      by authenticated official-role resolution)
- [x] 3.5 Use only migration-156-style `SECURITY DEFINER` helpers
      (`is_site_admin()`, `SET search_path = ''`) in any new policy predicate to
      avoid 42P17 recursion
- [x] 3.6 CREATE `public.get_show_officials(p_show_id uuid)` SECURITY DEFINER
      (returns person id, first/last name, email, role for active
      secretary/chairman/steward on the show); `GRANT EXECUTE ... TO authenticated`
- [x] 3.7 CREATE `public.get_club_show_manager_ids(p_club_id uuid)` SECURITY
      DEFINER (returns person ids with active club-scoped `secretary` role);
      `GRANT EXECUTE ... TO authenticated`
- [x] 3.8 Repoint the three direct `user_roles` cross-user reads to the RPCs:
      `useShowOfficials.fetchShowOfficials`, `useEntryFormData` secretary lookup,
      `getClubShowManagerIds`

## 4. Verification and rollout

- [x] 4.1 Run the tests from step 2 green
- [x] 4.2 Run the existing frontend AuthContext/RBAC test suite; confirm it
      stays green; update any test found reading another user's roles as a
      non-admin to the new correct expectation
- [x] 4.3 Run `migration-auditor` subagent on the new migration
- [~] 4.4 Run `supabase db push --dry-run`; confirm clean — **deferred to
      push-time** (worktree is not `supabase link`-ed; the real push (4.6) is a
      confirmation-gated ops step). Migration correctness covered by the
      `rbacRoleMapSelectRlsContract` source test + migration-auditor.
- [ ] 4.5 Request Codex second opinion (RLS change)
- [ ] 4.6 Push migration only after explicit user confirmation
- [ ] 4.7 Update `docs/security-audit-2026-07/README.md` status table (SA-006
      row → DONE) and this change's tracking status

## 5. Ship gate (final gate before archive)

- [ ] 5.1 Open PR citing this change; ensure CI (typecheck, lint, tests) passes
- [ ] 5.2 Complete code review (Claude code-reviewer + Codex second opinion for
      the RLS change) and resolve findings
- [ ] 5.3 Squash-merge to `main` (from the main repo, not the worktree)
