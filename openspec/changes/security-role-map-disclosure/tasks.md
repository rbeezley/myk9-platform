## 1. Map read paths (required before any SQL)

- [ ] 1.1 Grep `apps/myk9show/src/services/rbac/**` and
      `apps/myk9show/src/context/AuthContext.tsx` for direct reads of
      `user_roles`/`roles`/`permissions`/`role_permissions` vs. a
      `SECURITY DEFINER` RPC (`getUserPermissions`, `get_user_roles`, etc.)
- [ ] 1.2 Check whether any admin surface (`/admin/permissions/*`,
      `/admin/users`, role-request screens) lists other users' roles, and
      confirm it's already client-gated to admins
- [ ] 1.3 Determine whether the frontend needs the `roles`/`permissions`
      catalog outside admin surfaces
- [ ] 1.4 Record the map in the PR description as justification for the chosen
      scope

## 2. Write failing policy tests (red)

- [ ] 2.1 SQL/pgTAP or Deno test: exhibitor JWT SELECT on `user_roles` returns
      only own rows (currently all rows → red)
- [ ] 2.2 SQL/pgTAP or Deno test: exhibitor SELECT on `permission_audit_log`
      returns 0 rows (currently all rows → red)
- [ ] 2.3 SQL/pgTAP or Deno test: site-admin JWT retains full read on all five
      tables (regression guard, should already pass)

## 3. Implement the scoped migration

- [ ] 3.1 Write `<ts>_restrict_rbac_role_map_select.sql`: DROP the five
      `USING (true)` SELECT policies
- [ ] 3.2 CREATE scoped `user_roles` SELECT policy
      (`auth_user_id = auth.uid() OR is_site_admin()`, or admin-only if mapping
      shows self-resolution uses a `SECURITY DEFINER` RPC)
- [ ] 3.3 CREATE `is_site_admin()`-only SELECT policy for `permission_audit_log`
- [ ] 3.4 CREATE the decided SELECT policy for
      `roles`/`permissions`/`role_permissions` per the mapping outcome
- [ ] 3.5 Use only migration-156-style `SECURITY DEFINER` helpers in any new
      policy predicate to avoid 42P17 recursion

## 4. Verification and rollout

- [ ] 4.1 Run the tests from step 2 green
- [ ] 4.2 Run the existing frontend AuthContext/RBAC test suite; confirm it
      stays green; update any test found reading another user's roles as a
      non-admin to the new correct expectation
- [ ] 4.3 Run `migration-auditor` subagent on the new migration
- [ ] 4.4 Run `supabase db push --dry-run`; confirm clean
- [ ] 4.5 Request Codex second opinion (RLS change)
- [ ] 4.6 Push migration only after explicit user confirmation
- [ ] 4.7 Update `docs/security-audit-2026-07/README.md` status table (SA-006
      row → DONE) and this change's tracking status
