## Context

The site-admin role intent is "The platform is healthy." Today the admin area has the right owner surfaces, but the troubleshooting path is fragmented:

- `/admin/dashboard` summarizes platform administration but does not provide a direct platform-health answer.
- `/admin/support` captures diagnostics but leaves many values as raw facts instead of one-click investigation paths.
- `/admin/health` shows health snapshots and history but does not consistently name the owner surface or next action for degraded checks.
- `/admin/permissions` and `/admin/permissions/users` are the correct production access-repair surfaces, while `/admin/rbac-test` is debug-only but not always labeled that way.

The design follows the consolidation rule from the saved plan: do not add another incident page. Link to the surface that owns the work and keep each page's concern intact.

This work reads admin/support/health metadata and does not change show-day persistent data or mutation flows. Offline-first replication is not in scope because the admin troubleshooting surfaces are site-admin/online-operator tools rather than ringside or secretary core offline flows.

## Goals / Non-Goals

**Goals:**

- Give `/admin/dashboard` a five-second health/support/sync/recovery summary.
- Convert support-ticket diagnostics into direct, copyable investigation actions.
- Make degraded health checks actionable with owner/action metadata and non-hover history.
- Repair access troubleshooting labels/counts so missing relationships are explained instead of appearing as unexplained unknowns.
- Preserve the calm site-admin feeling by making the path from signal to owner surface obvious.

**Non-Goals:**

- No new `/admin/incidents`, `/admin/alerts`, or `/admin/performance` replacement.
- No duplicate support, sync, deleted-item, or permissions workflows inside the dashboard.
- No new notification system, impersonation, arbitrary data-repair UI, schema migration, RLS change, or external service integration.
- No change to secretary/show-day offline data paths.

## Decisions

### Keep Routing Helpers Narrow And Testable

Create or extend small TypeScript helpers near the touched admin page when a mapping is page-specific. For example, support diagnostics can map known fields (`route_path`, `show_id`, `user_id`, sync clues, deleted-item clues) to a typed list of actions and next checks. If an existing canonical route helper exists, reuse it; otherwise keep the helper local and covered by unit tests.

Alternative considered: a global admin investigation registry. That would add a new abstraction before the routing surface proves it needs to be shared.

### Dashboard Shows Signals, Not Duplicate Tools

The dashboard health band should consume already-available hooks/services where practical:

- health snapshots from the existing admin health query layer,
- support ticket counts from support inbox data/service code,
- sync signals by linking to `/admin/sync` and showing only cheap/current information that already exists,
- deleted-items recovery as a link unless a cheap count helper can be extracted from the existing deleted-items module without fetching every restore list.

Unavailable data renders as degraded but honest copy with the owner link.

Alternative considered: embedding mini versions of health, sync, support, and trash tables. That duplicates owner pages and increases maintenance cost.

### Health Metadata Lives With Health Presentation

Add a typed metadata map for health check keys that returns plain-English owner labels, destination routes, and next-action text. Unknown or malformed checks should still render as degraded/incomplete and link to `/admin/health` details or the operations runbook when no owner surface exists.

Alternative considered: storing remediation metadata inside the snapshot JSON. That would require runner/schema coordination and would make older snapshots less useful.

### Permission Trust Fixes Start With The Actual Data Path

Before patching labels or counts, inventory the permission data path in code and, if a migration/data fix becomes necessary, query `roles`, `permissions`, `role_permissions`, and user-role/profile joins together. Prefer query joins and explicit fallback labels over hiding missing relationships. Counts shown on role cards and overviews must use the same definition or explain the difference.

Alternative considered: replacing unknown labels with raw IDs everywhere. That is technically honest but not operator-friendly.

## Risks / Trade-offs

- [Risk] Dashboard summary could become a second admin command center. -> Mitigation: every card is a signal plus link, not a duplicate workflow.
- [Risk] Support diagnostic links could guess wrong for an entity ID. -> Mitigation: only link fields with known canonical destinations; leave unknown values copyable.
- [Risk] Deleted-item counts may be expensive if implemented by fetching all restore lists. -> Mitigation: ship a recovery link/degraded state unless an existing cheap helper exists.
- [Risk] Health key metadata can drift from runner keys. -> Mitigation: unit-test known keys and provide an explicit unknown/incomplete fallback.
- [Risk] Permission count fixes may reveal data-quality issues outside UI code. -> Mitigation: document missing joins clearly and avoid schema/data mutations unless evidence requires a separate migration.

## Migration Plan

Ship as an app-code-only PR with focused unit/component tests and admin route smoke coverage. Rollback is a normal code revert; no schema or data rollback is expected.

## Open Questions

- Which support-ticket diagnostic fields have canonical detail routes today versus only owner-surface routes?
- Can deleted-items count be computed cheaply without loading every deleted entity list?
- Do permission count mismatches come from query joins, naming, or genuinely different definitions?
