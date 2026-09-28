# Design

## Context

The schedule composes `useShowEntriesForUser` and `WhereToBe`; `mapDatabaseToClass` currently loses `start_time`. The dog Overview uses `getEntriesByDog`, whose direct authenticated row cannot carry protected result columns; Career Past Results uses `useExhibitorResults`. Secretary Entry Management uses `getEntriesForShow` from the show-scoped replica; `deleteEntry` currently writes only PostgREST and leaves a clean cached copy. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** Keep class time, check-in, run position, result, and removal consistent on existing pages, preserving calm exhibitor guidance and decisive secretary work lists from `docs/INTENT.md`.

**Non-Goals:** No invented run position, new page, new result release policy, payment mutation, or physical deletion.

## Decisions

1. Map stored class start time through the existing class compatibility layer and format it locally. Show `runOrder` only if positive; otherwise label position pending. Carry the canonical check-in status into `WhereToBe`. This reuses the existing schedule instead of duplicating My Shows controls.
2. Read protected scored fields from the existing authenticated result view and join them by entry ID to the dog-scoped entry read. Preserve the trial date from the entry join and the replica fallback. Keep `useExhibitorResults` fresh on dog-page mount and use the existing release display selector for placement.
3. After successful server soft-delete, evict its local replica row. Enable scoped stale-row cleanup on a successful full entry sync so other devices and pre-fix cached rows reconcile when the authorized view omits tombstones. Never remove pending local writes or infer deletion from a failed remote read. Existing Entry Management search remains replica-backed.

## Risks / Trade-offs

- A result-view read adds a dog-scoped query. Query only scored facts and keep the current entry read when that query fails, displaying an unknown result state where needed.
- Full-sync cleanup can remove rows that a user lost permission to see. It runs only after a complete successful scoped download and preserves dirty rows; that is consistent with the current authorization boundary.
- Cached result data can be stale across devices. Refresh on dog-page mount and focus, and retain existing retry behavior.

## Migration Plan

No schema migration. Deploy app code after checks; rollback restores old read behavior without changing stored entries. Historical tombstones remain in SQL.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Show-day replication and cross-role result visibility require focused tests plus app-wide verification.
