## Context

Continue docs/plan-linear-todo-2026-09-05.md C1 and openspec/specs/admin-system-health/spec.md. Existing healthCheckCadence is shared by UI and systemHealthChecks; remediation metadata flows through triageSelectors into NeedsALookSection and HealthCheckRow.

## Goals / Non-Goals

Preserve site-admin oversight and direct recovery (docs/INTENT.md). No new pages, dependencies, persistent-data reads, replication mutations, auth/RBAC changes, or broad freshness policy changes.

## Decisions

Use the existing shared cadence table rather than a second override. Pin all three ACL windows, coverage keys, full measurement and continuous carry-forward. Preserve timestamps and verdicts.

Before changing external navigation, reproduce both current consumers using the installed router. Do not treat the issue's malformed-URL claim as fact. After explicit INTENT approval, use validated discriminated targets and one shared link renderer so both consumers agree. Internal routes use Router Link; external HTTPS links use an anchor with new-tab indication. Unknown check ownership/fallback remains unchanged.

## Risks / Trade-offs

- Hosted bundle may retain old cadence → source/bundle comparison and separate approved cron-health-check deploy, then fresh/carry-forward snapshot proof. No historical rewrite.
- External-target protected INTENT → owner approval before implementation; C1a proceeds independently.
- Inaccessible or unexpected navigation → exact href/rel and keyboard tests on actual consumers, then site-admin browser replay at 1440×900 and 768×1024 using controlled local health data. Record SHA, routes and inspected evidence.
- Regression → cadence removal and renderer/mapping reversal must fail focused tests. Unknown keys keep 26h.

## Migration Plan

No DB migration. Review and CI before merge. Record current edge bundle/SHA before separately authorized deployment. Roll back with that bundle if snapshot proof fails; source changes revert via PR. Retain issues open for missing hosted/browser gates.

### [EXPANDED] Post-deployment evidence and recovery

Only after separate owner authorization, deploy `cron-health-check` from its app function root with `--no-verify-jwt`. Compare the deployed bundle against the approved source. Read the next daily and continuous snapshots: all three ACL keys must report `stale_after_ms = 172800000`; a continuous carry-forward must retain the daily timestamp and verdict. Re-walk both existing admin surfaces against those snapshots. A failed function run, missing key, wrong threshold or changed carried timestamp/verdict fails acceptance. Preserve the failed snapshot evidence, restore the captured prior bundle under the related deployment authorization, and verify a successful prior-behavior run. Keep MYK9-407 open if no fresh daily snapshot is available; do not manufacture one by mutating ACLs.
