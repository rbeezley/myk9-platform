## Context

The judge journey currently spans two data models. `/judge/dashboard`, `/judge/stats`, and `/judge/check-in` read denormalized `judge_assignments → classes → trials` snapshots, while `/at-show` reads show-scoped replicated classes and entries. Class count columns can remain zero or stale even when the entry replica has the real rows. The direct scoresheet performs its own trial/class/entry sync, but its render guard also depends on global first-sync state; a completed load that cannot resolve the row can therefore remain an unbounded skeleton.

The guarded remote E2E account setup inserts desired roles but does not deactivate stale undesired grants. The canonical judge can therefore present as `Secretary +2`, invalidating authorization evidence. Scoring writes already flow through the durable replication queue and `ringside_update_entry`; this change must preserve that path.

## Goals / Non-Goals

**Goals:**

- Make the guarded remote judge actor deterministically judge-only and provide assigned, unassigned, and no-assignment authorization subjects.
- Make direct scoresheet loading bounded and truthful while preserving offline cache use and assigned-judge authorization.
- Reuse one show-scoped entry row set for operational class totals instead of denormalized counter columns.
- Reuse existing buttons, cards, routes, labels, replication tables, and scoring mutations while improving touch and keyboard operation.
- Provide safe, repeatable browser proof without shared writes.

**Non-Goals:**

- No new judge or ringside surface.
- No direct PostgREST bypass in the steady-state show-day read path.
- No scoring mutation redesign or new replication public API unless a narrow read hydration seam is required.
- No remote account/role mutation or score write without an explicit shared-system approval gate.

## Decisions

### 1. Reconcile guarded remote E2E roles to their declared matrix

The guarded E2E account setup will compute each canonical actor’s exact declared scoped grants, deactivate active grants outside that matrix, reactivate matching rows, and insert missing rows. The judge remains `judge` only; existing multi-role fixtures retain their declared combinations. Pure reconciliation tests run without network access, while applying the plan to the remote E2E accounts remains an explicit shared-system approval gate.

**Alternative considered:** rely only on browser interception for role inventory. Rejected because interception cannot prove the real account’s authorization roles. A separate no-assignment judge actor is still needed for the empty-assignment journey, but it reuses the existing protected judge credential source rather than introducing a new secret.

### 2. Separate explicit scoresheet load completion from global sync status

`useAtShowScoresheet` will treat its explicit scoped sync/read attempt as the authoritative load lifecycle. Global replication status may explain that a retry is pending, but it will not suppress a terminal not-found/load error indefinitely. The hook will prefer existing local rows, run the established show/trial scoped syncs, and return either complete score data or a recoverable error state with retry/back navigation.

If investigation proves the class or entry cannot be hydrated through the existing view for an assigned judge, the fix will narrow the existing view/RPC authorization contract rather than adding a direct table read. Any SQL change requires source tests and a separate shared-system approval before deployment.

**Alternative considered:** add a timeout around the skeleton only. Rejected because it would mask an unresolved data contract rather than make loading truthful.

### 3. Derive operational counts from canonical show entry rows

Staff and judge surfaces will use the existing show-scoped entry query/cache identity and filter by `class_id`. Denormalized class counters remain metadata and fallback display only where no row-level access exists; they are not authoritative for an operational surface that already has entry rows. Cold/failed hydration renders loading or unavailable, not zero.

This extends the existing MYK9-65 plan rather than creating another query layer.

### 4. Make existing entry cards semantic

The existing card/action will become a semantic button or link with an explicit Score/Resume accessible name and visible action text. Nested reorder/favorite/menu controls retain independent targets and stop propagation where necessary. Frequent judge actions use the shared button sizing contract with a 44px minimum and 48px tablet preference.

**Alternative considered:** add a floating score button or dialog. Rejected as duplicate surface area and a break in the one-tap class-list flow.

### 5. Reuse display-name helpers

Raw identifiers will stay in diagnostics only. Default judge UI will reuse `formatRingLabel` and the assignment’s class/show/trial fields; it will never invent a second naming model.

### 6. Reuse the owned server in scheduled audit mode

The scheduled audit path will accept an explicit existing base URL/server ownership mode and skip Playwright’s web-server startup when that server is already owned by the audit. Stateful scoring remains guarded by existing interception/disposable-target checks. Missing or shared target identity fails before clicking a stateful action.

## Risks / Trade-offs

- **[Risk] Role cleanup deactivates a remote E2E role another spec assumed.** → Pin each canonical actor’s intended scoped role set in pure tests, preview the reconciliation plan, and require approval before applying it remotely.
- **[Risk] Canonical entry rows increase query work.** → Reuse the existing React Query cache key, compute per-class maps once, and avoid per-row requests.
- **[Risk] Scoresheet error appears during a genuinely slow first sync.** → Keep the explicit scoped load pending while its requests run and provide a retry; do not key the skeleton to unrelated global tables.
- **[Risk] Card semantics conflict with drag behavior.** → Keep drag handles and nested controls separate, cover pointer plus keyboard behavior, and avoid nested interactive elements.
- **[Risk] One broad batch becomes difficult to review.** → Implement and commit in dependency slices: fixture, scoresheet/offline proof, counts, then interaction/labels. Keep one OpenSpec change but allow multiple PRs if review safety requires it.

## Migration Plan

1. Land deterministic guarded E2E role reconciliation and pure tests; apply it remotely only after approval.
2. Land scoresheet hydration/error lifecycle plus intercepted judge scoring proof.
3. Migrate count consumers to the existing canonical show-entry query one surface at a time.
4. Land semantic/touch/label changes with focused component tests.
5. Run browser verification with read-only navigation and intercepted scoring; do not mutate shared Supabase without approval.

Rollback is per slice: revert the affected commit. No data migration is required for fixture or UI work; any later view authorization migration remains additive and independently reviewable.

## Open Questions

- Does the direct scoresheet failure originate solely in the client load lifecycle, or does the currently applied entry-results view differ from repository main? Resolve with guarded remote read-only/intercepted replay and source-level view contract tests before proposing SQL.
- Which existing show-entry hook now covers the reopened sibling surfaces of MYK9-65, and which judge surfaces still consume denormalized counters? Inventory before editing.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The batch touches authorization fixtures, offline/replication-backed scoring, cross-surface operational counts, accessibility behavior, and scheduled stateful browser execution.
