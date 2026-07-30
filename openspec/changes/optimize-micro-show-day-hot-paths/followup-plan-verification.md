# Follow-up Plan Verification

## Requirements Audit

| Requirement                                                            | Initial status | Patched evidence                                              |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| Preserve 100 sessions, 55 ringside sessions, Micro, and G9 thresholds  | Covered        | Design §7; load-rehearsal spec “G9 browser sessions”          |
| Remove show-wide per-write/full-sync fan-out                           | Missing        | Design §§8–9; access-context spec “Show-day invalidation”     |
| Preserve offline-first reconciliation and rolling-deployment safety    | Partial        | Design §§8–9 and new risk/rollback entries                    |
| Prevent mount-time `get_account_today_entries` amplification           | Missing        | Design §10; access-context spec “Account-today subscriptions” |
| Make the rehearsal model connected devices rather than reload storms   | Missing        | Design §7; load-rehearsal spec “connected show-day devices”   |
| Preserve the bounded OCC-contention fixture while distributing classes | Missing        | Design §11; load-rehearsal scoring-session scenario           |
| Make 97-style workflow failures diagnosable                            | Missing        | Design §11; load-rehearsal failure-evidence requirement       |
| Cover errors, cleanup, compatibility, and rollback                     | Partial        | Expanded risks, migration plan, rollback, and tasks 7–10      |
| Include focused and broad verification                                 | Partial        | Tasks 7.1–7.4 and 10.1–10.3                                   |
| Keep shared-system deploy/load actions behind separate approval        | Covered        | Tasks 10.4–10.6 and existing OPSX approval gates              |

## Initial Coverage: 38/100

The RBAC plan and unchanged-load gate were complete, but the new measured fan-out, startup
invalidation, workload realism, diagnostic, compatibility, and failure-mode requirements were not
covered.

## Patched Coverage: 100/100

The proposal, design, delta specs, risks, rollback, and tasks now cover each observed storm path,
the offline/rolling-deployment failure modes, realistic load behavior, diagnostic evidence, and
the required local/CI/remote gates.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The follow-up touches show-day realtime replication, a shared replication API, a
  database trigger function, and the launch-blocking distributed load harness.
