# Judge Responsibility Verification Plan

> **Status:** Active
> Tracked in openspec change: judge-responsibility-verification

**Date:** 2026-07-10
**Source matrix:** [`judge-responsibility-coverage.md`](judge-responsibility-coverage.md)
**Precedent:** [`secretary-responsibility-verification-plan.md`](secretary-responsibility-verification-plan.md) (all 44 rows verified 2026-07-09; 6 defects remediated in PR #1242)

## Purpose

Verify every judge responsibility row against the actual codebase and fall
2026 launch expectations, using the same evidence standard and verification
states as the secretary plan. The judge is not a primary fall role — this plan
scopes verification to the ringside `/at-show` experience plus judge-adjacent
secretary artifacts, and explicitly does not propose a judge portal.

## Ground Rules

Same as the secretary plan, plus:

- Do not expand fall scope. If a row's remediation implies judge login,
  dashboards, or notifications, it is Deferred, not a gap.
- Ringside write paths must preserve OCC (`ringside_update_entry`) and
  offline-first replication semantics.
- Registry correctness (AKC SW / UKC NW / ASCA SD qual codes and scoring
  fields) is verified against rulebooks, not assumptions.

## Verification States And Evidence Standard

Identical to the secretary plan (`Not started` → `Inventory complete` →
`Verified covered` / `Evidence partial` / `Implementation partial` /
`Potential gap` / `Verified gap` / `Deferred accepted` / `Remediation planned`
/ `Remediation complete`), with the same evidence-type table.

## Row Audit Backlog

| Row  | Responsibility                                            | Starting status  | Verification focus                                                                                                     |
| ---- | ---------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| J1.1 | Passcode entry into ringside, no account.                 | Evidence partial | Judge-code cold session on staging; throttle behavior; QR/print slip path.                                              |
| J1.2 | Judge-level write permissions via claim.                  | Evidence partial | **Phase 0 code trace DONE 2026-07-10 — gap CLOSED in code** (RPC four-tier authz, explicit errors, deny-by-default grants). Remaining: live staging session per the checklist in the coverage matrix row. |
| J1.3 | Show scoping + session expiry/regeneration.               | Evidence partial | `RingsideShowBoundary`/heartbeat behavior when secretary regenerates codes.                                             |
| J2.1 | Class list for the ring.                                  | Evidence partial | `AtShowClassListPage` walk per registry; adapter tests.                                                                 |
| J2.2 | Entry list / run order with live check-ins.               | Evidence partial | Combined run order behavior as check-ins/scratches happen (post-#1242 cache fixes).                                     |
| J2.3 | Search-area parameters visible (hides/distractions/time). | Potential gap    | Known data-model gap: these fields aren't persisted anywhere. Determine what ringside shows and what judges actually need. |
| J3.1 | Registry-correct scoring inputs and result codes.         | Evidence partial | Compare scoresheet options against AKC/UKC/ASCA rulebook qual codes.                                                    |
| J3.2 | Authoritative, duplicate-free score writes (OCC).         | Evidence partial | `ringside_update_entry` conflict handling; two-device test.                                                             |
| J3.3 | Offline scoring durability.                               | Evidence partial | Long-lead rehearsal (shared with secretary S9.1/S9.2 — schedule as one event).                                          |
| J3.4 | Minimal exhibitor data exposure ringside.                 | Evidence partial | Anon-session read-surface audit; Phase E leftovers.                                                                     |
| J4.1 | Class completion → placements.                            | Covered          | Refresh judge-side walk only; server logic verified 2026-07-09.                                                         |
| J4.2 | Ringside↔paper verification rhythm with secretary.        | Evidence partial | Live rehearsal step.                                                                                                    |
| J4.3 | Official paper signature artifacts.                       | Evidence partial | Print-hardware gate (shared with secretary S7.4).                                                                       |
| J5.1 | Correct a score at the ring pre-completion.               | Evidence partial | Judge-device clear/re-score walk; placement recalc.                                                                     |
| J5.2 | Absences/scratches visible at the ring.                   | Evidence partial | Judge-side view after secretary scratch/undo (post-#1242).                                                              |
| J5.3 | Concurrent-edit conflict resolution.                      | Evidence partial | Two-device OCC walk.                                                                                                    |
| J5.4 | Escalation path to secretary in-app.                      | Evidence partial | Announcement/message reach into ringside context.                                                                       |
| J6.1 | Assignment + workload (secretary-owned).                  | Covered          | Verified/remediated 2026-07-09 (S1.3).                                                                                  |
| J6.2 | Judge schedule report adequacy.                           | Evidence partial | One review pass of Judge Schedule / Entry Counts reports as a judge would read them.                                     |
| J6.3 | Credentials/qualifications records.                       | Evidence partial | Judge directory import still pending real data (existing OPEN-TODOS item); ASCA judge creation decision.                 |
| J6.4 | Self-service judge experience.                            | Deferred         | Confirm deferral holds.                                                                                                 |

## Execution Phases

1. **Phase 0 — J1.2 first.** The write-permission row is the only Potential
   gap that would be a show-day P0; verify it before anything else via a live
   staging judge-passcode session plus RLS/RPC code trace.
2. **Phase 1 — Code inventory sweep.** Parallel auditors over J1–J6 recording
   routes, components, RPCs, RLS policies, tests, and offline-safety, exactly
   as the secretary sweep did.
3. **Phase 2 — Workflow verification.** Judge-persona walks per registry on
   seeded shows; two-device OCC checks; report-adequacy review.
4. **Phase 3/4 — Remediation.** Focused OpenSpec change(s) per confirmed
   defect cluster, small PRs with tests, statuses updated in the matrix.

Long-lead items (offline rehearsal, print hardware) are shared gates with the
secretary plan — schedule them as combined events, not duplicates.

## Completion Criteria

Same as the secretary plan, applied to J-rows: every row at least
`Inventory complete`; every Potential gap resolved; every fall-required row
verified or carrying a remediation plan or evidence gate; matrix updated;
launch blockers represented in `OPEN-TODOS.md`.
