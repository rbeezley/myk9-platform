## Why

The first valid G9 rehearsal drove the remote Supabase Micro database to a restart while ordinary
page startup repeatedly executed overlapping RBAC joins and one-minute profile/permission polls.
Removing that avoidable work before buying more compute supports the fall 2026 launch-readiness
goal and gives the unchanged G9 rerun a fair test of the application's real capacity.

User request: `"2"` — optimize the application/database first, then retest Micro.

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
- Rerun the unchanged G9 scenario on Micro after deployment and record whether the database remains
  healthy and all capacity thresholds pass.

Non-goals:

- No Supabase compute upgrade or permanent capacity-cost increase.
- No weaker G9 thresholds, smaller workload, or altered concurrency profile.
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
- The existing manual G9 workflow, evidence artifact, and MYK9-109 tracking
- The remote Supabase project only after an explicit migration/deployment approval
