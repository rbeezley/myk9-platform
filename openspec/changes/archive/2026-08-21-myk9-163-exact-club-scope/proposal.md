## Why

The reopened MYK9-163 browser audit found that club-scoped assignment rows expose only “Club profile,” so site admins cannot verify the exact club before revoking access. Closing this authorization UX gap supports fall 2026 launch readiness by making a high-impact admin action calm, explicit, and auditable.

Original request: “start batch 1” (Lane 1C, MYK9-163).

## What Changes

- Resolve the exact club name with each club-scoped assignment returned to the canonical assignments ledger.
- Render the exact club name in the Scope column’s visible and accessible link text.
- Carry the assignment’s exact scope into the revoke action and repeat the user, role, and scope in the confirmation.
- Preserve distinct Global, Show, and Club scope labels, including an honest fallback if a related scope record cannot be resolved.
- Add assertion-first regression coverage for the service mapping, ledger presentation, accessible text, and revoke confirmation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-admin-troubleshooting-routing`: access-assignment labels and destructive confirmations must expose trustworthy, exact scope context.

## Impact

- Affected code: `RoleManager.getAllUserRoles`, the `UserRole` view model, `RoleAssignmentsPanel`, and focused tests.
- No database migration, RLS, permission, mutation, route, or new dependency changes.
- No offline/replication impact: this is an existing site-admin, online-only read and revoke surface.

## Surface Consolidation and Non-goals

This does not duplicate an existing page. `/admin/permissions?tab=assignments` remains the one canonical assignments ledger; a link cannot solve missing identity inside its destructive workflow because the admin must see the exact scope before choosing Revoke.

Non-goals: no new page, dialog, assignment affordance, role editor, club directory, show-name enhancement, or bulk-role behavior change.
