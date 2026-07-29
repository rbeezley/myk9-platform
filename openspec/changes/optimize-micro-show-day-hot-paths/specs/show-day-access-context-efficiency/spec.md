## ADDED Requirements

### Requirement: Current-user access data has one client lifecycle

The application SHALL maintain one authoritative current-user RBAC lifecycle per app instance.
Consumers of `useRBAC()` MUST reuse the roles, scoped permissions, effective permissions,
loading/error state, and refresh action owned by the auth context and MUST NOT start an independent
permission load or refresh interval.

#### Scenario: Multiple RBAC consumers mount

- **WHEN** multiple components call `useRBAC()` for the same signed-in user
- **THEN** they receive the auth context's shared access state
- **AND** their mounts do not create additional permission RPC requests or refresh timers

#### Scenario: Authenticated user changes

- **WHEN** the app changes from one authenticated user to another or signs out
- **THEN** the prior user's access state and cached results are not returned to the new session

#### Scenario: An older access request finishes last

- **WHEN** a newer refresh or invalidation occurs while an earlier access request is still in flight
- **THEN** the earlier response does not overwrite the newer shared state or repopulate an
  invalidated cache
- **AND** a point-in-time async permission check does not replace the authoritative shared snapshot

### Requirement: Complete access loads are coalesced and bounded

The RBAC service SHALL coalesce concurrent complete-access requests for the same user into one
in-flight operation and SHALL reuse a successful result for no more than five minutes. It MUST NOT
cache failed requests. An explicit refresh or relevant role mutation SHALL invalidate the user's
cached result before reloading.

#### Scenario: Concurrent callers request one user

- **WHEN** two callers request complete access data for the same user before the first request ends
- **THEN** both callers await one underlying RPC sequence

#### Scenario: Automatic refresh occurs within five minutes

- **WHEN** routine refresh requests access data before the successful result expires
- **THEN** the service returns the cached result without contacting Supabase

#### Scenario: Explicit refresh follows a role change

- **WHEN** the current user's role assignment changes and the client explicitly refreshes access
- **THEN** the prior result is invalidated and the next load contacts Supabase

#### Scenario: Access load fails

- **WHEN** the underlying permission or role request fails
- **THEN** the service reports the error, retains fail-closed client behavior, and does not cache the
  failed result

### Requirement: Automatic permission refresh is bounded without weakening suspension checks

The current-user RBAC lifecycle SHALL refresh permissions at most once every five minutes during
a continuously mounted session, excluding explicit invalidation and user changes. The existing
account-profile suspension polling cadence SHALL remain unchanged.

#### Scenario: App remains open for five minutes

- **WHEN** an authenticated app instance remains mounted without a role mutation
- **THEN** it performs no more than one automatic complete-access refresh in that five-minute window

#### Scenario: Account becomes suspended

- **WHEN** the existing profile poll observes `status = 'suspended'`
- **THEN** the existing suspension notification and sign-out behavior still runs independently of
  the permission refresh cadence

### Requirement: RBAC lookups use the indexed auth identity without changing authorization

The database RBAC functions SHALL filter `user_roles.auth_user_id` directly and MUST preserve their
existing signatures, output shapes, active/expiry filters, scope semantics, inherited `:manage`
permissions, security-definer configuration, fixed search path, and least-privilege execution
grants. The deployed project SHALL have an applicable auth-identity index, and the verified query
plan SHALL remove the `people` join. The evidence SHALL record whether PostgreSQL chooses the index
or a cheaper sequential scan at the deployed table cardinality.

#### Scenario: Seeded role contexts are compared

- **WHEN** the optimized functions are evaluated for seeded secretary and exhibitor identities
- **THEN** their roles, direct permissions, effective permissions, scopes, and active/expired
  behavior match the pre-migration results

#### Scenario: Scoped permission rows are mapped

- **WHEN** `get_user_permissions` returns its existing `scope_type` and `scope_id` columns
- **THEN** the client retains those exact show, club, or global scope values
- **AND** it does not infer obsolete `show_id` or `club_id` response fields

#### Scenario: Query plan is inspected

- **WHEN** `EXPLAIN (ANALYZE, BUFFERS)` is captured for representative RBAC lookups
- **THEN** no join to `people` is present
- **AND** the maintained `user_roles.auth_user_id` index exists and is applicable to the predicate
- **AND** any planner choice to scan the small role table instead is recorded rather than treated
  as a semantic failure

#### Scenario: Anonymous caller invokes an RBAC function

- **WHEN** an anonymous role attempts to execute an optimized RBAC function
- **THEN** execution remains denied

### Requirement: Optimization preserves show-day data architecture

The optimization MUST NOT bypass the replication-backed query/table layer or mutation manager for
show-day persistent data and MUST NOT change ringside scoring, OCC, queue, or retry behavior.

#### Scenario: Ringside workflow runs after optimization

- **WHEN** a ringside user reads replicated show data and submits a score
- **THEN** the established offline-first read and durable mutation paths remain in use
