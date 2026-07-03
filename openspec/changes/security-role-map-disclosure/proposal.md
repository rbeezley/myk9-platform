## Why

`user_roles`, `roles`, `permissions`, `role_permissions`, and
`permission_audit_log` all have `SELECT USING (true)` (mig `006_rls_policies.sql`),
so any signed-in user can enumerate the full RBAC map — who every admin/secretary
is, every user's show/club scoping, `auth_user_id` values, and the permission
audit trail. This is a recon/disclosure finding (SA-006,
`docs/security-audit-2026-07-03.md`); mutations are already correctly locked to
`is_site_admin()`. Fixing it closes the last open MEDIUM disclosure gap in the
audit's RBAC surface before launch.

## What Changes

- Map every read path against these five tables first (frontend RBAC resolution,
  admin surfaces, any catalog usage) — tightening SELECT without this map risks
  silently breaking a normal user's own-role resolution.
- Replace the five `SELECT USING (true)` policies with scoped replacements:
  `user_roles` → own rows or `is_site_admin()`; `permission_audit_log` →
  `is_site_admin()`-only; `roles`/`permissions`/`role_permissions` → keep readable
  if the frontend needs the catalog (deny `anon`), or gate to `is_site_admin()` if
  only admin surfaces use them.
- New migration only — never edit `006_rls_policies.sql`.

## Capabilities

### New Capabilities
- `rls-role-map-select-scoping`: scoped SELECT policies for the five RBAC tables,
  preserving current-user self-resolution and admin full-read while denying
  cross-user enumeration (SA-006).

### Modified Capabilities
(none)

## Impact

- DB: one new migration (`<ts>_restrict_rbac_role_map_select.sql`).
- Frontend: none expected if self-resolution goes through a `SECURITY DEFINER`
  RPC (verify during mapping); if any client path directly reads another user's
  roles as a non-admin, that path must be updated to the new correct behavior.
- Risk: RLS recursion (42P17) if a helper used in the new policy itself reads
  `user_roles` under caller RLS — must use the migration-156-style `SECURITY
  DEFINER` helpers, not `has_role`-style helpers that recurse.
- Tests: DB policy tests (red→green) plus the existing frontend AuthContext/RBAC
  test suite must stay green as the "didn't break self-resolution" proof. Codex
  second opinion required (RLS change).
- Fall 2026 launch: closes a pre-launch MEDIUM disclosure finding; does not add
  UI surface, so no duplication/link question applies.

Full technical detail: `docs/security-audit-2026-07/plan-role-map-disclosure.md`.
