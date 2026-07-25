## Context

`entries` and `classes` are both in `supabase_realtime` and in the offline-first delta-poll set. Current Postgres Changes consumers are spread across `useShowLiveSync`, `useAtShowRealtimeRefresh`, `useNotificationMonitor`, check-in hooks, TV display, a public-browse legacy listener, a zero-consumer ringside hook, and a zero-consumer legacy `RealtimeManager`. The live database confirms the six-table publication from PR #584 remains unchanged; accumulated `pg_stat_statements` attributes 55.5% of tracked execution time since 2025-12-08 to Realtime WAL decode queries.

Show-day roles deliberately depend on near-live coordination. `docs/INTENT.md` says a gate steward and judge must see the same state, while offline operation remains normal. The transport can change, but replication/query authority, polling fallbacks, and the existing screens must not.

## Goals / Non-Goals

**Goals:**

- Replace `entries`/`classes` Postgres Changes with one minimal Broadcast signal per committed row change.
- Use one shared private channel per show per browser client, regardless of how many mounted consumers need the signal.
- Keep replicated tables and existing authorized queries as the only readers of row data.
- Preserve notification semantics, near-live invalidation, reconnect/foreground recovery, and periodic polling.
- Remove unreachable realtime plumbing and narrow the publication only after the client has no reachable dependency on those table streams.

**Non-Goals:**

- No UI, route, copy, or notification-type changes.
- No mutation, OCC, conflict-resolution, replication-schema, presence, or edit-awareness changes.
- No migration of `shows`, `show_announcements`, or `show_messages`; their live consumers and lower write rates remain valid.
- No claim that Broadcast eliminates all WAL work. It replaces the less scalable source-table Postgres Changes path with Supabase's recommended fan-out path and a minimal payload.

## Decisions

### 1. Broadcast a nudge, never a database row

An `AFTER INSERT OR UPDATE OR DELETE` trigger on `entries` and `classes` calls `realtime.send` with event `showday_change`, topic `show:<show-id>:changes`, and a payload containing only the changed table name. Class changes resolve `show_id` through `classes.trial_id -> trials.show_id` inside the trigger.

**[EXPANDED] Failure isolation and scope moves:** the trigger catches Broadcast errors, raises a warning for observability, and returns without aborting the originating write. For an UPDATE that changes an entry's `show_id` or a class's trial/show scope, it signals both distinct old and new show topics so the former show removes stale data and the new show gains it.

This preserves the current `useShowLiveSync` principle: Realtime is only a pre-sync signal. Full `NEW`/`OLD` records were rejected because Broadcast topic authorization happens at channel join rather than per row; sending entry records would widen data exposure relative to Postgres Changes RLS.

### 2. One shared private channel per show

A small TypeScript subscription registry owns the Supabase channel for each show. Consumers register callbacks; the registry creates the channel for the first callback and removes it after the last callback. This consolidates the currently duplicated entry/class channels while allowing each surface to keep its own debounce and refresh behavior.

**[EXPANDED] Lifecycle rule:** channel removal is generation-aware. If a consumer re-subscribes while an asynchronous `removeChannel` is settling, the old cleanup cannot remove the newly created registry entry. Supabase reconnect remains automatic; channel errors are non-fatal because data correctness comes from the fallbacks below.

Private-channel SELECT authorization on `realtime.messages` admits `anon` and `authenticated` only for the `show:<uuid>:changes` topic shape. The signal contains no row id, row values, counts, or user data. This covers public TV clients, anonymous passcode sessions, exhibitors, and staff without creating a parallel row-authorization model.

Alternatives rejected:

- A public channel: workable for a payload-free nudge, but private channels keep Realtime authorization explicit.
- One channel per table or consumer: duplicates connections and fan-out work.
- Client-side broadcast after mutations: misses writes from imports, SQL, other clients, and future integrations.
- Full-row `realtime.broadcast_changes`: recreates row-disclosure concerns and tempts consumers to bypass replication.

### 3. Re-fetch authoritative state before acting

Invalidation-only consumers call their existing query invalidation, replication sync, or page refresh callbacks. `useNotificationMonitor` refetches its existing authorized entries/classes query and evaluates class-starting, results-posted, and dogs-ahead notifications from the refreshed snapshot. Its existing 30-second refetch remains the fallback and deduplication continues to prevent repeated alerts.

**[EXPANDED] Burst rule:** consumers debounce or coalesce repeated signals before starting network work. If a signal arrives during an in-flight refresh, they run at most one trailing refresh so the final authoritative state is observed without one query fan-out per changed row.

The legacy `BrowseShowsPage` hook keeps its valid `shows` subscription but drops its unrelated all-entries listener. Zero-consumer `useClassRealtime`, `RealtimeManager`, and the unused generic table subscription helper are deleted instead of migrated.

### 4. Publication removal is the final migration action

The migration creates authorization, function, and triggers before guarded `ALTER PUBLICATION ... DROP TABLE` statements for `entries`, `classes`, and `show_message_threads`. `show_message_threads` has no surviving subscriber; message delivery listens to `show_messages`.

Code is deployed before the migration is pushed. Until the trigger exists, existing 30–60 second polls and foreground/manual refreshes keep the new client correct, though temporarily less fresh. After the migration, old tabs lose Postgres Changes but retain those same fallbacks until refreshed.

## Risks / Trade-offs

- **[Risk] Trigger lookup adds work to every class change.** → Use the indexed `trials` primary-key lookup and emit one small message.
- **[Risk] Realtime infrastructure errors could fail a core show-day mutation.** → Catch all signal-delivery errors inside the trigger, log a warning, and let the entry/class transaction proceed; polling repairs freshness.
- **[Risk] A row moves from one show scope to another.** → Broadcast once to each distinct old/new show topic.
- **[Risk] Broadcast channel cannot join before the migration/policy is applied.** → Consumers treat channel failure as non-fatal and retain existing polling/foreground fallbacks.
- **[Risk] Notification refetch coalesces multiple changes and loses exact old/new transitions.** → Evaluate current authoritative state with existing per-class and 60-second dedup sets; class-starting/results are one-shot, and dogs-ahead is recalculated from the current in-ring entry.
- **[Risk] An anonymous client can subscribe to a known show topic.** → Payload contains only `entries` or `classes`; no row identifiers or values. Existing authorized reads still decide what data the client can see.
- **[Risk] Rollback reintroduces Postgres Changes cost.** → Re-add the three publication tables and revert the client transport; polling remains a correctness fallback during either order.

## Migration Plan

1. Land client registry, converted consumers, deletions, tests, and the unapplied migration in one PR.
2. Deploy the merged client; verify polling/foreground fallback remains healthy while private Broadcast is unavailable.
3. With owner approval, dry-run then push the migration to staging.
4. Verify publication membership, trigger/policy presence, one private subscription per show, and two-context entry/class refresh latency.
5. Compare Realtime/Postgres execution, Postgres Changes event volume, Broadcast event volume, and lag before/after a bounded show-day workload; record the observation window and workload so the result is repeatable.
6. Keep explicit corrective SQL ready to re-add `entries`, `classes`, and `show_message_threads` to `supabase_realtime`, drop the two triggers/function/policy, and then revert the client transport if Broadcast delivery or authorization fails.

## Open Questions

None. The owner selected the Broadcast replacement over accepting polling-only freshness.
