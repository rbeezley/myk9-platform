## Context

Entry rows carry assigned handler text and identity separately from dog ownership. At-show queue screens do not render handler identity; migrating them introduced needless asynchronous work. The real Reports check-in mapper used legacy handler text, and the scheduled emergency packet RPC has its own handler expression.

## Decisions

1. Keep the canonical projection at the entry read boundary. Assigned text/person takes precedence; owner is used only when both are absent. An assigned but unresolved person remains unknown.
2. Leave at-show queues on their established replicated reads. They need no handler identity projection until a UI consumer displays it.
3. The existing hydrator refreshes people with generation guards. Reports must observe completion, including during its first query, and update the printable data.
4. Route the actual Reports print mapper and AKC form through the assigned handler rule; do not add another report route.
5. Update the scheduled packet's service-role-only SQL function at its current definition, preserving authorization and filters.

## Risks and verification

Offline cache incompleteness and refresh races can display stale names; test initial and deferred hydration through the real Reports query. Verify printed check-in and scheduled packet output, not only a hook with no production caller. A new SQL function definition needs migration guard and review before database deployment.
