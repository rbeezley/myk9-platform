# Realtime publication audit — `supabase_realtime` membership vs. `postgres_changes` subscribers

**Date:** 2026-06-07
**DB:** `sojmvhhwsjxmfistvzbe` (myk9-platform)
**Trigger:** Investigation of `RealtimeScoringService` subscribing to `scores`/`placements`, which were never added to the `supabase_realtime` publication.

## Why this matters

Supabase Realtime streams `postgres_changes` by tailing the Postgres WAL **through the `supabase_realtime` publication**. A table that is not a member of that publication produces no WAL stream for Realtime, so a `.on('postgres_changes', { table: 'X' })` subscription **silently delivers nothing** — no error, no warning, the callback simply never fires. On show day this means a "live" surface can quietly stop updating.

## Live publication membership (source of truth)

```sql
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

| Table | Added by migration |
|---|---|
| `entries` | `092_add_check_in_status.sql` |
| `show_messages` | `106_show_messages.sql` |
| `show_message_threads` | `106_show_messages.sql` |
| `classes` | `108_tv_display_anon_access.sql` |

The publication is **fully reproducible from migrations** (1:1 match — no dashboard-only drift). No re-assertion migration is needed.

## Subscriber audit — every `postgres_changes` table target vs. membership

| Table | Exists? | In publication? | Subscriber(s) | Verdict |
|---|---|---|---|---|
| `entries` | ✅ | ✅ | `useClassRealtime`, `useNotificationMonitor`, `useCheckInStatusSubscription`, `useShowCheckInSubscription`, `useRealTimeUpdates`, `useTVRealtime` | Healthy |
| `classes` | ✅ | ✅ | `useClassRealtime`, `useNotificationMonitor`, `useTVRealtime` | Healthy |
| `show_messages` | ✅ | ✅ | `messageStore` | Healthy |
| `show_message_threads` | ✅ | ✅ | (chat threads) | Healthy |
| `scores` | ❌ never existed | ❌ | `RealtimeScoringService` (**unmounted — 0 consumers**) | **Dead code → removed** |
| `placements` | ❌ never existed | ❌ | `RealtimeScoringService` (**unmounted — 0 consumers**) | **Dead code → removed** |
| `show_announcements` | ✅ | ❌ | `announcementStore` (**live** — mounted via `useAnnouncementSubscription` in `App.tsx`) | ⚠️ **Real live bug** |
| `shows` | ✅ | ❌ | `useRealTimeUpdates` (live on `BrowseShowsPage`) | ⚠️ Real, low-severity |
| `entry_checkins` | ❌ never existed | ❌ | `subscriptionManager` → `services/competition/*` → `useLiveCompetition` | Phantom; likely dead cluster |
| `live_scoring_sessions` | ❌ never existed | ❌ | `subscriptionManager` → `services/competition/*` → `useLiveCompetition` | Phantom; likely dead cluster |

## Primary finding & resolution: `scores` / `placements`

- The `scores` and `placements` tables **never existed** in the DB (`to_regclass` → NULL; no migration ever created them). Scores are persisted as **columns on `entries` rows** (`result_status`, `is_scored`, `search_time_seconds`, …) via `replicatedEntriesTable.updateEntry()` in `useOptimisticScoring`.
- `RealtimeScoringService` (and its wrapper hook `useRealtimeScoring`) had **zero consumers** — the singleton's `getInstance()` is never called, so the subscription never even instantiated.
- `scoreSyncProcessor` was registered **only** in that dead service's constructor (never elsewhere), so it was orphaned by the removal. The live scoring path syncs via `@myk9/replication`, not the `syncQueue` processor.

**Action taken (this PR):** deleted the dead cluster — no migration written (adding non-existent tables to the publication would error, and the publication is already migration-reproducible):

- `apps/myk9show/src/hooks/useRealtimeScoring.ts`
- `apps/myk9show/src/services/realtime/RealtimeScoringService.ts`
- `apps/myk9show/src/services/realtime/RealtimeScoringService.types.ts`
- `apps/myk9show/src/services/realtime/RealtimeScoringService.helpers.ts`
- `apps/myk9show/src/services/sync/scoreSyncProcessor.ts`

**Live scoresheet realtime path (confirmed working, unchanged by this removal):** ringside/class list live-updates ride `entries` + `classes` `postgres_changes` (both published) plus the `@myk9/replication` sync layer. Removing the dead service cannot regress it.

## Secondary findings (same bug class) — RESOLVED in this PR (full sweep)

1. **`show_announcements` (real live bug) → FIXED via migration.** The table exists and `announcementStore` subscribes live (INSERT/UPDATE/DELETE), but it was not in the publication — so **in-app realtime announcement updates silently no-op'd**. (Push notifications were unaffected; they ride a DB trigger → webhook, independent of `postgres_changes`.) RLS already permits authenticated SELECT, so Realtime delivers once published. Migration `20260607143000_realtime_publish_announcements_and_shows.sql` adds it to the publication and sets `REPLICA IDENTITY FULL` (the store filters on `show_id`, and DELETE only carries old-tuple columns — FULL is required for the filter to match, mirroring migration 108's `entries` fix).

2. **`shows` (real, low severity) → FIXED via migration.** `useRealTimeUpdates` (BrowseShowsPage) and `useShowRealTimeUpdates` (show-management) subscribe to `shows`, which was unpublished. Same migration adds it. Left at `REPLICA IDENTITY DEFAULT` — subscribers filter on the PK (`id`) or use a full-reload DELETE path, so FULL is unnecessary and would add WAL overhead on a hotter table.

3. **`entry_checkins` + `live_scoring_sessions` (phantom) → dead cluster DELETED.** The `services/competition/*` subsystem subscribed to two tables that never existed, the same shape as the removed scoring service. Its only surface, `LiveCompetitionDashboard`, is rendered nowhere (`useLiveCompetition`, `PresenceIndicators`, `LiveEntryStatus` are its sole consumers). The whole cluster — `services/competition/`, `services/realtime/` (generic plumbing reachable only from the dead cluster: `subscriptionManager`, `connectionManager`, `realtimeClient`, `RealtimeConnectionManager`, `RealtimeEventBus`), `hooks/useLiveCompetition.ts`, `hooks/live-competition/`, `hooks/useRealtime.ts` (0 consumers), and `components/scoring/RealtimeConnectionStatus.tsx` (rendered nowhere) — was deleted. Typecheck stayed green (24/24) across all 39 deletions, proving no live code depended on any of it. Kin of the collaboration cluster deleted in PR #576.

## Net change in this PR

- **Deleted (39 files):** the dead `scores`/`placements` scoring-realtime cluster + the dead `competition`/`realtime` plumbing cluster. No live behavior changed (all verified unmounted / unrendered / zero-consumer; typecheck 24/24).
- **Migration:** `show_announcements` + `shows` added to `supabase_realtime` so their existing live subscribers actually receive events.
- **No-op by design:** no migration for `scores`/`placements`/`entry_checkins`/`live_scoring_sessions` — those tables never existed and have no remaining subscribers.
