# MYK9-133 Offline Scoring Queue Warning Plan

## Policy decision

- Use warn-only behavior for the offline scoring sync queue.
- Never evict an unsynced score merely because the queue is large; an
  unattempted score may be the judge's only copy of the result.
- Warn at 1,000 queued items in the existing `JudgeSyncDashboard`.
- Remove the unused `maxCacheSize` configuration rather than presenting a
  misleading eviction limit.
- Revisit spill-to-export only if show-day telemetry demonstrates queues
  growing beyond this threshold.

## Implementation

1. Remove the inert cache-size setting and add a named warning threshold.
2. Add a pure queue-threshold predicate and focused unit coverage.
3. Show a persistent dashboard alert that explains the risk and directs the
   judge to restore connectivity or export a backup; do not mutate the queue.

## Testing

- Test the threshold predicate below, at, and above the warning boundary.
- Test the existing retention behavior remains lossless for never-attempted
  items.
- Run focused scoring helper tests, dashboard tests if available, app
  typecheck, and the relevant lint checks.
- Review the final diff for unrelated changes.
