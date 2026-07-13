## Why

The offline replication core contains two oversized orchestration classes whose proven internal seams are only partially extracted, making show-day reliability changes harder to review and increasing regression risk. Finishing the decomposition now supports fall 2026 launch readiness by making the durability-critical queue, upload, query, and row-lock behavior independently testable without changing runtime behavior.

## What Changes

- Add public-API pinning coverage for the load-bearing mutation ordering, OCC, backup, event, and fallback-lock behaviors identified in Plan 007.
- Extract pure mutation execution and row-synchronization helpers from `MutationManager` without changing their behavior.
- Extract mutation queue persistence and upload orchestration into internal collaborator classes while retaining `MutationManager` as the unchanged public facade.
- Extract `ReplicatedTable` query operations and row-lock bookkeeping into internal collaborators while preserving its template-method inheritance contract.
- Preserve all package exports, public and protected signatures, event names and payloads, transaction boundaries, behavioral comments, and offline-first semantics.
- Update the Plan 007 and backlog trackers when the implementation is verified and merged.

This change does not duplicate an existing product surface: it is an internal decomposition of the existing replication layer, so a UI link is not applicable. It adds no page, dialog, affordance, dependency, persistence mechanism, or user-facing workflow. Behavior changes, public API changes, conflict-lifecycle extraction, app-subclass edits, and unrelated line-count cleanup are explicit non-goals.

## Capabilities

### New Capabilities

- `replication-core-contract-preservation`: Defines the externally observable replication contracts and reliability invariants that must remain unchanged during the internal decomposition.

### Modified Capabilities

None. This change does not alter the requirements of existing capabilities.

## Impact

- Affected package: `packages/replication`.
- Primary files: `MutationManager.ts`, `core/ReplicatedTable.ts`, their existing tests, and new internal sibling modules.
- Consumers: myK9Show replication table subclasses continue using the same APIs and package exports.
- Verification: replication build and tests, monorepo typecheck and lint, and myK9Show tests after every extraction phase.
- Design source: `docs/improve-audit-2026-07-11/007-replication-core-split.md`.
