## Context

See `proposal.md` for motivation. `main.tsx` already mounts `QueryProvider` around the router using `lib/queryClient.ts`, but `App.tsx` creates and mounts a nearer client around `<Outlet />`. React context therefore directs every routed hook to the nearer bare client while several modules import and mutate the configured singleton that routed hooks do not use.

The configured singleton owns the opt-in Sentry `QueryCache.onError`, mutation logging, reconnect behavior, retry policy, and global placeholder-data behavior. `App.tsx` separately applies legacy performance defaults and a startup prefetch to its private client. Core show-day persistent data remains owned by the replication layer; this change only aligns the React Query coordination/cache layer and does not introduce direct Supabase reads or alter mutations.

## Goals / Non-Goals

**Goals:**

- Make the existing `QueryProvider` the sole application-level owner for routed content.
- Preserve startup prefetching while targeting the mounted configured client.
- Make routed cache controls and invalidations resolve the active client through context.
- Pin the topology and opt-in failure-monitoring behavior in focused tests.
- Preserve the calm, reliable experience described in `docs/INTENT.md` by improving invisible failure reporting without adding UI.

**Non-Goals:**

- Re-tune every global query default or individual query key.
- Change replication-backed reads, offline mutation behavior, or user-visible surfaces.
- Add automatic Sentry reporting for ordinary offline/connectivity failures.

## Decisions

### Keep `QueryProvider` at the composition root and remove the shell provider

`main.tsx` is the correct ownership boundary because it wraps the router itself. `App.tsx` will stop importing `QueryClient` and `QueryClientProvider`, creating a client, or wrapping `<Outlet />`.

Alternative considered: remove `QueryProvider` from `main.tsx` and keep the provider in `App`. Rejected because router-level error elements and any providers outside `<App />` would not share the application client, and it would preserve the less explicit ownership boundary.

### Run startup prefetch against the configured singleton without reapplying legacy defaults

The existing startup prefetch will move into `QueryProvider` and target its imported client. The legacy `optimizeQueryCache` call will not be applied to the configured singleton because `setDefaultOptions` would replace deliberate options from `lib/queryClient.ts`, including monitored retry decisions, reconnect behavior, network mode, and placeholder data.

Alternative considered: call all three legacy performance helpers from `QueryProvider`. Rejected because the optimization helper is not additive and would silently overwrite the configuration this issue is restoring; performance monitoring is currently a no-op.

### Routed consumers use the contextual client

Data Settings, class start-time editing, and trial-management dialogs will use `useQueryClient()` for user-triggered cache operations. This makes their target explicit and testable and prevents future provider refactors from reintroducing singleton/cache divergence.

Alternative considered: leave direct singleton imports unchanged. They would work after provider removal, but context resolution better expresses that these routed components act on their mounted cache.

### Test behavior at the provider boundary

A focused provider test will render a routed consumer and assert client identity plus monitored error capture through a real rejected query. A source/topology regression assertion will ensure `App` cannot silently add a second provider. Existing component tests will be updated to inject and assert against contextual clients.

## Risks / Trade-offs

- [All routed queries begin using previously shadowed defaults] → Run focused query/report tests plus app typecheck; retain the configured policy rather than partially merging two accidental configurations.
- [Global placeholder data can surface stale rows during key changes] → Preserve `useReportData`'s explicit stale-state guard and correct its comment to identify the now-active configuration.
- [StrictMode can invoke startup effects twice in development] → React Query deduplicates an identical in-flight prefetch; use a cancellable timer and avoid introducing mutable global initialization state.
- [Tests that mocked the singleton may stop observing contextual operations] → Supply a test query client through the repository custom render utility and assert against that client.

## Migration Plan

Ship as a normal frontend deployment with no schema or shared-system mutation. Rollback is the code revert; no persisted data migration is required. Existing cached data remains compatible because query keys and serialized storage are unchanged.
