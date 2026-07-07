## Why

Original request: `/opsx:ship docs/plan-site-admin-support-health-remediation.md`

Site admins need the admin area to answer "is the platform healthy?" and then route directly to the existing surface that can resolve an issue. The current dashboard, support inbox, health board, and access pages each hold part of that story, but the flow still makes an operator copy IDs, infer ownership, or interpret unexplained degraded states.

This supports fall 2026 launch readiness by improving troubleshooting and recovery without competing with secretary/show-day reliability. It keeps the current consolidation posture: no new incident page, no duplicate tooling, and every shortcut lands on an existing owner surface.

## What Changes

- Add a compact platform-health summary to `/admin/dashboard` that links to existing health, support, sync, and deleted-item surfaces.
- Add support-ticket investigation actions that convert diagnostic fields into direct links, copyable escalation context, and role-appropriate next checks.
- Extend `/admin/health` so failed, warning, stale, unknown, or incomplete checks name an owner surface and next action.
- Repair access troubleshooting labels/counts so normal seeded/admin data does not show unexplained `Unknown User` or `Unknown Role`.
- Label debug-only RBAC test destinations clearly wherever they remain linked.
- Do not add a new admin incident page or rebuild support, sync, deleted-item recovery, or permissions workflows inside another page.

## Capabilities

### New Capabilities

- `site-admin-troubleshooting-routing`: Dashboard and support-ticket routing behavior that turns admin health/support signals into links to existing resolution surfaces.

### Modified Capabilities

- `admin-system-health`: Health checks expose owner/action metadata and understandable incomplete/run-history states.

## Impact

- Affected app areas: `apps/myk9show/src/pages/admin/AdminDashboard*`, `SupportInboxPage*`, `SystemHealthPage*`, `permissions/*`, admin route helpers, and related tests.
- Affected docs/tracking: the saved remediation plan and any active tracking docs updated when implementation completes.
- No database schema, RLS, shared package, offline replication, or new external service changes are planned.
