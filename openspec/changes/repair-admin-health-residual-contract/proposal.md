## Why

MYK9-407 and MYK9-409 leave the existing admin health contract incomplete: one daily ACL check uses the legacy stale window, and recovery links lack an explicit external-target contract. Repairing those gaps supports dependable fall 2026 operator recovery.

Original implementation request: "Implement that plan faithfully, preserving full details, dependencies, acceptance/non-goals, tests and evidence gates." Authoritative scope: docs/plan-linear-todo-2026-09-05.md, C1a/C1b.

## What Changes

- Supply public-schema ACL daily cadence and pin registry completeness and persisted carry-forward windows.
- Reproduce current external navigation before changing its causal diagnosis.
- After explicit protected-INTENT approval, carry validated route/external targets through both existing consumers with accessible external-link indications.
- Keep deploy, browser, PR and merge evidence gates open until proved.

Does this duplicate an existing surface? No. Existing /admin/health and /admin/dashboard link to the existing operator runbook. No new page or duplicated recovery workflow is needed.

Non-goals: ACL/grant changes, cron schedules, historical snapshot rewrites, permission changes, public docs publication, unrelated typography, or show-day data changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-system-health`: complete ACL cadence and explicit recovery targets.

## Impact

Shared health cadence, edge cron-health-check dependency bundle, remediation map, dashboard triage action and existing health/dashboard consumers. No replication or RBAC architecture changes. Owner approval is required before the protected target extension and before hosted deployment; source completion cannot close hosted gates.
