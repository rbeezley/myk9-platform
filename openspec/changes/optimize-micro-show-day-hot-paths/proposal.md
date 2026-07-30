## Why

The first valid G9 rehearsal drove the remote Supabase Micro database to a restart while ordinary
page startup repeatedly executed overlapping RBAC joins and one-minute profile/permission polls.
Removing that avoidable work before buying more compute supports the fall 2026 launch-readiness
goal and gives the unchanged G9 rerun a fair test of the application's real capacity.

User request: `"2"` — optimize the application/database first, then retest Micro.

Follow-up user request: `"proceed"` — implement the app and rehearsal remediation after the
post-RBAC G9 run exposed show-wide realtime fan-out, mount-time account-entry refetches, and
one-second hard-reload amplification.

MYK9-126 follow-up user request: `"proceed"` — separate standard GitHub-runner saturation from
remaining backend latency, correct the session-lifecycle evidence, then rerun the unchanged G9
workload before considering a compute upgrade.

## What Changes

- Deduplicate and briefly cache a user's complete RBAC access context within each app instance so
  concurrent consumers share one load and routine refreshes do not repeat identical RPC traffic.
- Stop independent `useRBAC()` consumers from maintaining a second permission lifecycle beside the
  existing auth context.
- Replace one-minute permission polling with a bounded five-minute refresh while preserving
  explicit refresh after role mutations. Keep the separate account-suspension check unchanged.
- Rewrite the existing RBAC lookup functions to use the indexed
  `user_roles.auth_user_id` column already maintained by the database instead of joining through
  `people` for every request.
- Preserve current roles, direct permissions, inherited `:manage` permissions, scope behavior,
  account-suspension handling, offline-first show-day data paths, and fail-closed authorization.
- Scope show-day invalidation signals to the affected classes and sync only the changed replicated
  table path, while retaining a backward-compatible full-sync fallback for old unscoped signals.
- Prevent replication subscription attachment and duplicate hook consumers from immediately
  refetching `get_account_today_entries`.
- Correct the G9 browser behavior so connected sessions stay open instead of hard-reloading every
  second, distribute scoring sessions across classes, and record exact workflow failure reasons.
- Record per-runner host CPU, memory, event-loop delay, browser-control responsiveness, context
  preparation, and synchronized-start headroom so backend latency is not judged from a saturated
  generator.
- Distinguish configured, prepared/open, started, completed, failed, and peak-active workflows
  instead of treating a workflow's lifetime as the number of concurrent browser sessions.
- Rerun the corrected, still 100-session/55-ringside G9 scenario on Micro after deployment and
  record whether the database remains healthy and all capacity thresholds pass.

Non-goals:

- No Supabase compute upgrade or permanent capacity-cost increase.
- No weaker G9 thresholds, smaller workload, or reduced concurrency profile.
- No new page, dialog, control, or duplicate testing surface.
- No changes to ringside mutation semantics, replication, OCC retry policy, or circuit breakers.
- No claim that Micro is sufficient until a complete unchanged G9 run passes.

This change does not duplicate an existing surface. It consolidates two existing client-side RBAC
lifecycles and optimizes existing database functions; a link cannot remove duplicated background
traffic.

## Capabilities

### New Capabilities

- `show-day-access-context-efficiency`: Defines bounded client refresh behavior, shared in-instance
  RBAC loading, indexed database lookup behavior, authorization equivalence, and unchanged-load
  verification on Micro.

### Modified Capabilities

- `show-day-load-rehearsal`: Requires the post-optimization capacity decision to come from the same
  G9 workload and thresholds used for the baseline.

## Impact

- `apps/myk9show/src/context/AuthContext.tsx`
- `apps/myk9show/src/hooks/useRBAC.ts` and focused hook/context tests
- `apps/myk9show/src/services/rbac/PermissionChecker.ts` and focused service tests
- A new additive migration under `supabase/migrations/` for RBAC function query plans
- The show-day Broadcast signal, at-show realtime refresh adapter, and account-today subscription
  lifecycle
- The G9 browser runner, metrics, shard aggregation, and evidence renderer
- The distributed runner resource sampler and session-lifecycle evidence contract
- A backward-compatible additive migration that includes affected class IDs in Broadcast signals
- The existing manual G9 workflow, evidence artifact, and MYK9-109 tracking
- The remote Supabase project only after an explicit migration/deployment approval
