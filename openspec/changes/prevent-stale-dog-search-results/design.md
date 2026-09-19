## Context

See `proposal.md`. The advanced secretary picker exposes local filter-chip state while overlapping dog reads can complete in a different order. The repair belongs at the query/data boundary, not in visual filtering after a stale result has won.

## Goals / Non-Goals

**Goals:** bind cached/requested dog results to the normalized search and deterministically reject stale completion.

**Non-Goals:** change fuzzy matching, add a picker, or accommodate unrelated staging fixture drift.

## Decisions

1. Put the normalized search term in the canonical React Query key and pass its abort signal through the underlying request when the current query implementation supports it.
2. If the data source aggregates multiple requests or cannot abort, add a monotonic/latest-request guard at that existing query boundary; do not patch component state after render.
3. Add a deterministic regression test with a delayed earlier response. Prefer a hook/unit integration test for speed, plus the existing affected E2E scenarios when environment access permits.
4. Search is an online management lookup and does not create a new replication path. Already-loaded/replicated roster behavior must remain unchanged.

## Risks / Trade-offs

- [Changing query keys increases cache entries] → normalize/trim terms and preserve existing stale/gc timings.
- [Abort errors become visible failures] → explicitly classify superseded cancellation as non-error while retaining genuine network error feedback.
- [E2E staging remains flaky from fixtures] → keep the deterministic test as the acceptance proof and report staging-only blockers separately.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The fix is scoped to one management search/query flow but changes asynchronous result ordering.
