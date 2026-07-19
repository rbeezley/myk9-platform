## Why

Source request: `myk9-25`.

Supabase Postgres Changes WAL decoding accounts for 55.5% of tracked database execution time since 2025-12-08, while `entries` and `classes` changes are also pulled through the offline-first replication layer. Fall 2026 launch readiness needs to preserve near-live show-day coordination without paying the less scalable per-subscriber Postgres Changes authorization cost.

## What Changes

- Replace `entries` and `classes` `postgres_changes` listeners with a minimal, show-scoped database Broadcast signal.
- Keep `@myk9/replication` and existing authorized queries as the only data authority; Broadcast payloads identify that a change occurred but do not distribute row data.
- Consolidate or remove redundant listeners so every surviving show-day consumer uses the shared Broadcast contract.
- Remove `entries`, `classes`, and the unused `show_message_threads` table from the `supabase_realtime` publication only after no surviving client subscribes to their Postgres Changes.
- Preserve the existing 30–60 second polling, reconnect, foreground-refresh, and manual-refresh fallbacks.
- Add migration contract tests and focused hook/store tests for Broadcast routing, debouncing, cleanup, and fallback behavior.
- **Non-goals:** no new page, dialog, notification surface, or parallel data cache; no change to scoring mutations, OCC conflict handling, RLS-visible row data, presence/edit-awareness channels, `shows`, `show_announcements`, or `show_messages` delivery.

This does not duplicate an existing surface: it replaces transport plumbing beneath current screens. A link cannot solve database load or cross-device freshness.

## Capabilities

### New Capabilities

- `showday-realtime-delivery`: Deliver minimal show-scoped change signals through Broadcast while replication and existing queries remain authoritative, with polling and foreground fallbacks intact.

### Modified Capabilities

None.

## Impact

- Database: a show-day Broadcast trigger/function and narrowed `supabase_realtime` publication membership.
- myK9Show: live-sync, at-show refresh, notification monitoring, check-in, TV display, and legacy browse-show listener consolidation.
- Shared ringside package: remove or migrate any remaining `entries`/`classes` Postgres Changes consumer proven reachable in the monorepo.
- Security: Broadcast contains no entry/class row payload; topic authorization must admit the same anonymous, passcode, authenticated, and public-display clients that currently receive change signals without widening row-data access.
- Operations: staging migration application and live two-context verification remain shared-system approval gates.
