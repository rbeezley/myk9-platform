# Phase 1: Read Path Audit — ReplicatedTable.ts

**Audited:** packages/replication/src/core/ReplicatedTable.ts (614 lines)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Scope

Read path: `fetchAll`, `fetchOne`, `subscribe`, real-time merge into IDB, initial hydration.
Out of scope: mutations (covered by MutationManager audit), conflict resolution (Phase 3).

## Method map

| Method    | Lines | Responsibility |
| --------- | ----- | -------------- |
| (fill in) |       |                |

## Findings

### Correctness

### Error surfacing

### Invariants

### Resource cleanup

### Concurrency

### Offline semantics

### Test coverage gaps

## Remediation plan
