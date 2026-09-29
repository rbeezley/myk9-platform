# Design

## Context

The schedule composes `useShowEntriesForUser` and `WhereToBe`; `mapDatabaseToClass` currently loses `start_time`. The dog Overview uses `getEntriesByDog`, whose direct authenticated row cannot carry protected result columns; Career Past Results uses `useExhibitorResults`. Secretary Entry Management uses `getEntriesForShow` from the show-scoped replica; `deleteEntry` currently writes only PostgREST and leaves a clean cached copy. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** Keep class time, check-in, run position, result, and removal consistent on existing pages, preserving calm exhibitor guidance and decisive secretary work lists from `docs/INTENT.md`.

**Non-Goals:** No invented run position, new page, new result release policy, payment mutation, or physical deletion.

## Decisions

1. Map stored class start time through the existing class compatibility layer and format it locally. Show `runOrder` only if positive; otherwise label position pending. Carry the canonical check-in status into `WhereToBe`. This reuses the existing schedule instead of duplicating My Shows controls.
2. Keep entry-list completeness separate from scored-fact completeness. Read protected scored fields from the existing authenticated result view and join them by entry ID, but report a failed score read explicitly. Preserve the trial date from the entry join and replica fallback. A missing release field is unknown, not proof of an unreleased class; the dog surfaces may call a result preliminary only after a successful scored projection says release is null. A disabled or paused dog-roster query is unavailable with retry, not indefinitely loading.
3. After successful server soft-delete, evict its local replica row and supersede queued edits. Hold a per-entry guard while a racing download can still carry the old live row. Retire the guard after a complete fetch proves absence or a server tombstone, so a later restore can appear without a page reload. Existing Entry Management search remains replica-backed.
4. A zero-row replication receipt alone does not prove a secretary show is empty: a permission gap can produce the same result. Check it against a manager-authorized server count independent of the replication view. Persist proof of a legitimate empty scope for offline reuse; without that proof, show an unavailable state rather than a factual empty queue.

## Risks / Trade-offs

- A result-view read adds a dog-scoped query. Query only scored facts and keep the current entry read when that query fails, displaying an unknown result state where needed.
- Full-sync cleanup can remove rows that a user lost permission to see. It runs only after a complete successful scoped download and preserves dirty rows; that is consistent with the current authorization boundary.
- Cached result data can be stale across devices. Refresh on dog-page mount and focus, and retain existing retry behavior.

## Migration Plan

The authoritative secretary count requires a narrowly authorized SQL function. Deploy its migration after merge and before the frontend change; until then an unverified empty scope stays unavailable. Historical tombstones remain in SQL.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Show-day replication and cross-role result visibility require focused tests plus app-wide verification.
