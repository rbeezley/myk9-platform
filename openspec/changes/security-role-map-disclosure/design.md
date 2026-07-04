## Context

`006_rls_policies.sql` grants `SELECT USING (true)` on `user_roles`, `roles`,
`permissions`, `role_permissions`, and `permission_audit_log`. This almost
certainly exists because the frontend resolves the current user's roles by
reading these tables directly. Mutations are already `is_site_admin()`-gated and
verified clean by the audit — only the read side is open. Evidence:
`docs/security-audit-2026-07-03.md` SA-006 (MEDIUM).

## Goals / Non-Goals

**Goals:**
- Deny cross-user enumeration of the role map, the permission catalog's sensitive
  scoping data, and the permission audit log.
- Preserve every normal user's ability to resolve their own roles/permissions
  (no lockout regression).
- Avoid RLS recursion (42P17) by using `SECURITY DEFINER` helper functions that
  read `user_roles` as definer, not helpers that join under caller RLS.

**Non-Goals:**
- Changing what mutations are allowed (already correctly `is_site_admin()`-gated;
  out of scope, verified clean).
- Redesigning the RBAC admin UI (`/admin/permissions/*`, `/admin/users`) — only
  its data-access policy changes, not its behavior for admins.

## Decisions

1. **Map before scoping** — grep `apps/myk9show/src/services/rbac/**`,
   `AuthContext.tsx`, and all admin surfaces for direct reads of these five
   tables before writing any policy, and record the map in the PR description.
   *Alternative considered:* write the scoped policy first and fix breakage
   reactively — rejected per CLAUDE.md's debugging-seed-data rule (inventory
   before writing SQL) and because an RBAC lockout is a severe regression to
   discover after merge.
2. **`user_roles` SELECT** — `(SELECT auth.uid()) = auth_user_id OR
   (SELECT is_site_admin())`, `TO authenticated`. Mapping outcome (task §1):
   self-resolution goes through the `get_user_roles`/`get_user_permissions`
   `SECURITY DEFINER` RPCs (mig 017/065, RLS-bypassing) so login does **not**
   depend on this policy; the own-row clause is kept only as defense-in-depth for
   any direct self-read. Admin full-read via `is_site_admin()`.
   *Alternative considered:* admin-only — rejected as needlessly strict once the
   own-row clause is free.
2b. **Cross-user official reads move to `SECURITY DEFINER` RPCs** — the map found
   three legitimate non-admin reads of another user's `user_roles` that
   self-or-admin would break: `useShowOfficials`/`getShowOfficials` (officials by
   `show_id`), `useEntryFormData` secretary lookup (by `show_id`),
   `getClubShowManagerIds` (by `club_id`). New `public.get_show_officials(uuid)`
   and `public.get_club_show_manager_ids(uuid)` RPCs (definer, `search_path=''`,
   `GRANT ... TO authenticated`) serve these; the three client reads are
   repointed to them. Officials render only in authenticated views
   (`ShowExhibitorView`/`ShowManagementShell`), never the anon `ShowPublicLanding`
   — so `authenticated`-only grants suffice, no `anon`.
   *Alternative considered:* broaden the policy to keep show/club-scoped rows
   readable — rejected: that leaves the audit's "every user's show/club scoping +
   `auth_user_id`" enumeration open, defeating the fix.
3. **`permission_audit_log` SELECT** — `is_site_admin()`-only; no non-admin reason
   to read the audit trail was found in the source plan's analysis.
4. **`roles`/`permissions`/`role_permissions` SELECT** — keep readable to
   `authenticated` (deny `anon`) if the frontend needs the catalog for admin
   dropdowns; gate to `is_site_admin()` if only admin surfaces consume them. The
   map determines which.
5. **Recursion avoidance** — use the migration-156 `SECURITY DEFINER` helper
   pattern (already proven not to recurse) rather than `has_role`-style helpers
   that read `user_roles` under the caller's own RLS, which caused a documented
   42P17 in the 2026-06-11 `is_club_admin` review.

## Offline-first / replication impact

None. The five RBAC tables (`user_roles`, `roles`, `permissions`,
`role_permissions`, `permission_audit_log`) are not part of the `@myk9/replication`
offline-first surface — they are resolved once at session init, not synced as
show-day persistent data. Tightening their SELECT policies therefore has no
effect on offline reads, mutation queues, or conflict resolution. The only
liveness concern is current-user role resolution at login, guarded by spec
Requirement 3 and the AuthContext/RBAC regression suite.

## Risks / Trade-offs

- [Tightening SELECT breaks a client path that directly reads another user's
  roles as a non-admin] → Mitigation: the mapping step (decision 1) surfaces
  every such path before the policy changes; any found path is either
  admin-gated on the client too or updated to the new correct behavior as part
  of this change, not discovered after merge.
- [RLS recursion (42P17) from a helper that reads `user_roles` under caller RLS]
  → Mitigation: use only the migration-156 `SECURITY DEFINER` helper pattern;
  do not introduce a new `has_role`-style helper.
- [Admin surfaces silently lose the ability to list other users' roles] →
  Mitigation: explicit `is_site_admin()` full-read clause on `user_roles`,
  regression-tested.

## Migration Plan

1. Grep-map every read path against the five tables; record findings.
2. Write `<ts>_restrict_rbac_role_map_select.sql`: DROP the five
   `USING (true)` SELECT policies, CREATE the scoped replacements decided above.
3. Run DB policy tests (SQL/pgTAP or Deno harness) red, then green.
4. Run the existing frontend AuthContext/RBAC test suite; it must stay green
   (self-resolution proof). Update any test found reading another user's roles
   as a non-admin to the new correct expectation.
5. `migration-auditor` clean; `supabase db push --dry-run` clean; push only
   after explicit confirmation.
6. Rollback: a follow-up migration restoring the prior `USING (true)` policies
   if a scoping predicate proves wrong in production — never hand-edit `006`.

## Open Questions

- Does current-user self-resolution go through a `SECURITY DEFINER` RPC (making
  the `user_roles` own-row SELECT clause redundant) or a direct client read?
  Resolves during the mapping step.
- Does the frontend need the `roles`/`permissions` catalog outside admin
  surfaces? Resolves during the mapping step.
