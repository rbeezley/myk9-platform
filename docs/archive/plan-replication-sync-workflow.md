# Replication Sync Workflow Plan

## Goal

Deepen `@myk9/replication` so it owns Replicated Table Sync choreography instead
of requiring each app table to reimplement metadata reads, incremental fetches,
dirty-row protection, conflict handling, stale cleanup, mutation upload timing,
and result reporting.

## Architecture Decision

`@myk9/replication` should preserve dirty local rows by default. Table adapters
can opt into field-level merge for server-authoritative fields such as scoring
and placement.

The first proving target is Entry sync in myK9Q and myK9Show because Entry sync
exercises the highest-risk cases: ringside offline writes, check-in and scoring
conflicts, local deletes, orphan cleanup, `license_key` scoping in myK9Q, and
`show_id` scoping in myK9Show.

## Proposed Module Shape

Add a package-owned sync workflow, tentatively:

```typescript
syncReplicatedTable(table, adapter, scope, options)
```

The package workflow owns:

- sync metadata reads and writes
- full vs incremental sync decisions
- dirty-row preservation
- field-level merge dispatch
- batch cache writes
- stale-row cleanup
- mutation upload timing
- success and error result reporting

The table adapter owns:

- remote row fetch
- remote-to-local row mapping
- local-to-mutation payload mapping
- conflict policy
- row ID extraction
- tenant/show/license scope filtering

## Phases

1. Done: Add package sync workflow types and tests around dirty-row preservation.
2. Done: Port myK9Q Entry sync to the workflow with `license_key` scope.
3. Done: Port myK9Show Entry sync to the workflow with `show_id` scope, local
   delete tombstones, and orphan cleanup behavior preserved.
4. Done: Remove duplicated Entry sync choreography from app adapters once tests pass.
5. Evaluate Class/Trial/Show adapters after Entry proves the seam.

## Testing Phase

- Package unit tests for clean remote insert/update, dirty local preservation,
  field-level server merge, stale cleanup, metadata updates, and sync errors.
- myK9Q Entry sync tests for offline score preservation and server-authoritative
  scoring/placement merge.
- Done: myK9Show Entry sync tests for pending local Entry preservation, delete
  tombstone non-resurrection, and orphan local-only cleanup.
- Run targeted package and app tests before considering the phase complete.
