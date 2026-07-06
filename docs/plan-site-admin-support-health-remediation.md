# Site Admin Support And Health Remediation Plan

**Date:** 2026-07-06
**Status:** Proposed
**Source audit:** [`docs/audits/2026-07-06-site-admin-support-health-ux-audit.md`](audits/2026-07-06-site-admin-support-health-ux-audit.md)
**Role intent:** Site Admin — "The platform is healthy"
**Launch frame:** Fall 2026 launch readiness; admin work supports troubleshooting and recovery, while secretary/show-day reliability remains the top product priority.

## Goal

Make the site-admin troubleshooting flow feel like one coherent operator console:

1. The dashboard answers "is the platform healthy?"
2. Support tickets point directly to the relevant user, route, show, sync, health, or deleted-item recovery surface.
3. Health checks explain ownership and the next step when a check is failed, stale, warning, or incomplete.
4. Access troubleshooting is trustworthy: no unexplained `Unknown User`, `Unknown Role`, or contradictory permission counts.

## Consolidation Decision

Do not add another admin incident page.

Use the existing surfaces:

- `/admin/dashboard` for summary and routing.
- `/admin/support` for incident/ticket triage.
- `/admin/health` for health status and remediation links.
- `/admin/sync` for sync-specific investigation.
- `/admin/deleted-items` for soft-delete recovery.
- `/admin/permissions` and `/admin/permissions/users` for access repair.
- `/admin/help` for page discovery and debug-only destinations.

This follows the current consolidation rule: if the work belongs on page B, link to page B with context instead of rebuilding page B inside page A.

## Non-Goals

- Do not rebuild deleted `/admin/alerts` or `/admin/performance`.
- Do not introduce a new notification/alerting system.
- Do not add user impersonation or arbitrary field-repair UI; those remain accepted SQL/manual gaps for fall.
- Do not move secretary/show-day work behind admin polish if a launch-blocking secretary issue appears.

## Phase 1: Dashboard Health Summary

**Problem:** `/admin/dashboard` does not answer "Everything looks normal" at a glance.

**Build:**

- Add a compact Platform Health band above or near the current admin cards.
- Show:
  - Latest `/admin/health` overall state and run age.
  - Open support ticket count and show-day priority count.
  - Latest sync failure or stale sync signal, if available.
  - Deleted Items count or a recovery link if counts are cheap and already available.
- Use deep links, not duplicated tooling:
  - Health state -> `/admin/health`.
  - Support count -> `/admin/support`.
  - Sync issue -> `/admin/sync`.
  - Deleted Items -> `/admin/deleted-items`.
- If data for a card cannot load, show a plain degraded state and a link to the owner surface.

**Acceptance criteria:**

- Dashboard gives a site admin a 5-second answer to platform status.
- Every dashboard health card either links to a resolving surface or clearly says why the signal is unavailable.
- No card uses false status language such as "Active" unless backed by real status.

**Likely files:**

- `apps/myk9show/src/pages/admin/AdminDashboard/*`
- `apps/myk9show/src/pages/admin/SystemHealthPage*`
- Support ticket hooks/services under `apps/myk9show/src/pages/admin/SupportInboxPage*`
- `apps/myk9show/src/components/admin/DataLifecycleManagement/DeletedEntitiesTab.tsx` only if a count helper can be safely extracted without duplicating UI.

## Phase 2: Support Ticket Investigation Links

**Problem:** Support diagnostics expose useful facts but leave the admin manually copying IDs and guessing where to go.

**Build:**

- Convert diagnostics into actions when values exist:
  - `route_path` -> "Open reported page".
  - `show_id` -> show detail or show workbench, depending on available context.
  - `trial_id`, `class_id`, `entry_id`, `dog_id`, `user_id` -> canonical route where one exists.
  - Sync-related fields -> `/admin/sync`.
  - Soft-delete/recovery clue -> `/admin/deleted-items`.
- Add "Copy diagnostics" for escalation.
- Add a small "Next checks" area based on available diagnostics:
  - Route issue: open reported route, then health.
  - Data missing: open related entity, then Deleted Items.
  - Sync issue: open Sync Monitoring, then Health.
  - Access issue: open User Roles/Permissions.
- Preserve ticket status actions; do not turn the page into a second dashboard.

**Acceptance criteria:**

- An admin can move from a support ticket to the likely resolving page in one click.
- Raw UUIDs remain copyable but are secondary to human labels and actions.
- Tickets without diagnostics have a clear empty state and still offer "Copy ticket link".

**Likely files:**

- `apps/myk9show/src/pages/admin/SupportInboxPage*`
- Support ticket type/service files used by the inbox.
- Route helpers, if an existing canonical-route helper exists; otherwise add a narrow local helper with tests.

## Phase 3: Health Check Remediation Links

**Problem:** `/admin/health` shows status, but failed or incomplete checks do not consistently say what to do next.

**Build:**

- Add owner/action metadata per health check:
  - Sync -> `/admin/sync`.
  - Payout/payment -> `/admin/payouts` plus runbook link if needed.
  - Support/ticket signal -> `/admin/support`.
  - Deleted/recovery issue -> `/admin/deleted-items`.
  - Permission/access issue -> `/admin/permissions`.
  - Migration/deploy/manual checks -> operations runbook link.
- Treat "not checked here" as a distinct `coverage incomplete` state, not buried detail text.
- Replace hover-only recent run dots with a compact text/history list or an expandable details area.
- Keep technical labels secondary; show plain-English check names first.

**Acceptance criteria:**

- Every failed, stale, warning, or incomplete check has an owner surface and next action.
- Recent run history is understandable without hover.
- Health remains glanceable in the all-green state.

**Likely files:**

- `apps/myk9show/src/pages/admin/SystemHealthPage*`
- Health check data model/helpers.
- `docs/operations/admin-support-runbook.md` for linked runbook anchors if needed.

## Phase 4: Access Troubleshooting Trust

**Problem:** Permissions pages show `Unknown User`, `Unknown Role`, and contradictory counts, which undermines admin trust.

**Build:**

- Inventory the role/user/permission data path before patching:
  - `roles`
  - `permissions`
  - `role_permissions`
  - user-role joins and any profile/person joins used by the UI.
- Fix query joins or fallback labeling so missing labels are explained.
- Reconcile role-card permission/user counts with the overview counts.
- Label `/admin/rbac-test` as debug-only wherever it is linked.
- Keep production access repair in `/admin/permissions` and `/admin/permissions/users`.

**Acceptance criteria:**

- No unexplained `Unknown User` or `Unknown Role` appears for normal seeded/admin data.
- If a label truly cannot be resolved, the row explains the missing relationship and keeps the ID copyable.
- Role cards and overview counts use the same definition or clearly label different definitions.

**Likely files:**

- `apps/myk9show/src/pages/admin/permissions/*`
- Permission/user-role query hooks and services.
- Related permission tests.

## Phase 5: Lower-Priority Polish

Do after Phases 1-4 unless these become cheap while touching the same files.

- Move template maintenance actions ("Force Initialize", "Reset Templates", "Clean Duplicates") into an Advanced Maintenance area with clearer risk copy.
- Reduce admin-mode sidebar scanning cost if cross-role groups remain distracting during site-admin work.
- Clean up repeated console-warning noise only if the fix is local and does not distract from support/health flow work.
- Audit stale docs/help/search references to deleted admin pages after one more mainline release.

## Testing Plan

Every implementation PR must include focused tests for its phase and at least one browser smoke for the admin path it changes.

### Unit/Component Tests

- Dashboard summary renders healthy, warning, stale/unavailable, and failed-card states.
- Support diagnostics helper maps known diagnostic fields to correct links/actions.
- Health check metadata returns owner/action for failed, warning, stale, and incomplete states.
- Permissions queries/count helpers handle missing joins without unexplained unknown labels.

Use existing test utilities from `apps/myk9show/src/test/utils/testUtils.tsx`.

### Route/Browser Checks

Run focused Playwright route health after each phase:

```bash
pnpm --dir apps/myk9show test:e2e:clean \
  src/test/e2e/route-health-by-role.spec.ts \
  --grep "Route health: admin" \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

For Support and Health phases, add or update a focused admin workflow spec if current route-health coverage cannot prove the new links/actions.

### Static Checks

For TypeScript app changes:

```bash
pnpm --dir apps/myk9show typecheck
pnpm --dir apps/myk9show lint
```

Run broader root checks only if a phase touches shared packages, auth/RBAC primitives, database migrations, or cross-app code.

## Recommended PR Order

1. **Dashboard summary skeleton and real links** — small, high-value, low database risk.
2. **Support diagnostics actions** — makes the incident flow useful.
3. **Health remediation metadata/history** — makes health status actionable.
4. **Permissions data trust repair** — higher data/query risk; do after the flow is clearer.
5. **Template advanced-maintenance polish** — lower priority.

## Done Definition

- A site admin can start on `/admin/dashboard`, see current health/support risk, open a relevant ticket, jump to the affected route/entity/system surface, and understand the next health remediation step without copying raw IDs.
- The remaining admin troubleshooting surfaces each own one concern and link to each other instead of duplicating controls.
- Focused tests and admin route-health smoke pass for every completed phase.
