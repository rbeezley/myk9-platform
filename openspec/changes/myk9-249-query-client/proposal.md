## Why

Routed myK9Show content is wrapped by a second, bare React Query client that shadows the configured application client. As a result, monitored financial-query failures never reach Sentry, cache controls and direct invalidations target an unused cache, and routed pages silently miss the intended retry and reconnect behavior; correcting this improves fall 2026 operational visibility and cache reliability.

## What Changes

- Remove the nested React Query provider and its private client from `App` so routed content uses the configured application client from `QueryProvider`.
- Apply the existing performance setup and startup prefetch to that same configured client rather than to a discarded client.
- Ensure direct cache clearing and invalidation imports address the client mounted for routed pages.
- Correct report-data documentation so it describes the client configuration that is actually active.
- Add regression coverage proving routed content has one provider/client and proving an opted-in routed query failure reaches the monitored-failure capture path.
- Non-goals: changing query keys, adding new pages or controls, changing offline replication paths, or broadly redesigning per-query cache policies.
- Duplication check: this removes a duplicated infrastructure provider; no product surface is added, and a link cannot address a context-shadowing defect.

## Capabilities

### New Capabilities

- `query-client-integrity`: Routed application content uses one configured React Query client for fetching, cache operations, invalidation, and opt-in failure monitoring.

### Modified Capabilities

None.

## Impact

- `apps/myk9show/src/App.tsx`, `main.tsx`, `providers/QueryProvider.tsx`, `lib/queryClient.ts`, and the startup performance setup.
- Direct singleton consumers in Data Settings, class start-time editing, and trial-management dialogs become aligned with the mounted cache without requiring new UI.
- Routed queries begin receiving the configured defaults that were previously shadowed, including retry, reconnect, placeholder-data, cache logging, and opt-in Sentry behavior.
