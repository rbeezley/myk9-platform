# Fix Plan — Restrict the RBAC role-map SELECT (SA-006)

> **Status:** Active

Covers **SA-006** from [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md):
`user_roles`, `roles`, `permissions`, `role_permissions`, and
`permission_audit_log` all have `SELECT USING (true)` (mig `006_rls_policies.sql`),
so any signed-in user can enumerate the full role map — who the admins/secretaries
are, every user's show/club scoping, `auth_user_id` values, and the whole permission
catalog. Recon/disclosure, not escalation (mutations are correctly locked to
`is_site_admin()` — verified).

## Why this needs a decision (not mechanical)

The blanket read almost certainly exists because the **frontend resolves the current
user's roles/permissions by reading these tables directly**. Tightening SELECT
without first mapping those read paths will silently break RBAC resolution (users
lose their own roles → locked out). This is the classic "looks like a one-line
policy fix, actually a data-path change" — **map the readers first.**

## Step 1 — Map the read paths (required before any SQL)

Grep the client and RPCs for every read of these tables:
- `apps/myk9show/src/services/rbac/**`, `apps/myk9show/src/context/AuthContext.tsx`
  — how does it resolve *the current user's* roles? Direct `from('user_roles')` or a
  `SECURITY DEFINER` RPC (`getUserPermissions`, `get_user_roles`, etc.)?
- Does any admin surface (`/admin/permissions/*`, `/admin/users`, role-request
  screens) list *other users'* roles? Those legitimately need a broad read — but it
  should be `is_site_admin()`-gated, not open to all.
- Does the frontend need the `roles`/`permissions` **catalog** (reference lists for
  admin dropdowns)? That's lower-sensitivity than `user_roles`.

Record the map in the PR description — it's the justification for the chosen scope.

## Step 2 — Choose the scoped policies

Based on the map, likely target state:
- **`user_roles`** — `SELECT USING (auth_user_id = (SELECT auth.uid()) OR is_site_admin())`.
  Own rows for self-resolution; full read for admins. If self-resolution actually
  goes through a `SECURITY DEFINER` helper (which bypasses RLS), the own-row clause
  may be unnecessary and SELECT can be `is_site_admin()`-only — **verify which**.
- **`permission_audit_log`** — `SELECT USING (is_site_admin())`. No non-admin reason
  to read the audit trail.
- **`roles` / `permissions` / `role_permissions`** — if the frontend needs the
  catalog, keep readable but consider `TO authenticated` (deny anon) and confirm no
  sensitive scoping data rides on these rows. If only admin surfaces use them,
  gate to `is_site_admin()`.

Watch for **RLS recursion (42P17)**: `user_roles` policies that call helpers which
themselves read `user_roles` under FORCE RLS caused a documented recursion bug
(see the 2026-06-11 review's `is_club_admin` correction). Use the migration-156
`SECURITY DEFINER` helpers that read `user_roles` as definer (no recursion), not
`has_role`-style helpers that join under the caller's RLS.

## Step 3 — New migration

`<ts>_restrict_rbac_role_map_select.sql` — DROP the five `USING (true)` SELECT
policies, CREATE scoped replacements. New file, never edit `006`.

## Testing phase (assertion-first — gate for completion)

1. **DB policy tests** (SQL/pgTAP or Deno harness), red first:
   - exhibitor JWT SELECT on `user_roles` → only own rows (currently all → red);
   - exhibitor SELECT on `permission_audit_log` → 0 rows (currently all → red);
   - site-admin JWT → full read on all five (must stay green — regression guard).
2. **Frontend RBAC regression** — the existing AuthContext/RBAC tests must stay
   green: a normal user still resolves their own roles/permissions after the
   tightening. This is the "didn't break self-resolution" proof. If any test reads
   another user's roles as a non-admin, that's the leak the fix closes — update the
   test to the new correct behavior.
3. `migration-auditor` clean; `supabase db push --dry-run` clean; **push only after
   confirmation**. Codex second opinion ON.

## Done criteria

Non-admin users can read only their own `user_roles` rows and cannot read the audit
log; admin surfaces and current-user RBAC resolution still work (proven by
still-green frontend tests); no 42P17 recursion; migration auditor-clean.
