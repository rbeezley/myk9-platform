## Context

Entry rows carry assigned handler text and identity separately from dog ownership. The earlier consumer migration routed at-show queues through general-purpose reads that await financial and release enrichment, and the real Reports check-in mapper still used legacy handler text.

## Decisions

1. Keep the canonical projection at the entry read boundary. Assigned text/person takes precedence; owner is used only when both are absent. An assigned but unresolved person remains unknown.
2. Serve at-show show/class reads from replicated entries, dogs, and cached people without awaiting online enrichment. Preserve queue fields such as `isInRing` and check-in status in the typed row.
3. The existing hydrator refreshes people with generation guards. Completion during the initial query must still reach the visible query result.
4. Route the actual Reports print mapper through `handler_identity`; do not add another report route.

## Risks and verification

Offline cache incompleteness and refresh races can display stale names; test initial and deferred hydration. Queue state can be lost in DB-shaped adapters; test in-ring and check-in state with real replicated rows. Verify the printed check-in output, not only a hook with no production caller.
