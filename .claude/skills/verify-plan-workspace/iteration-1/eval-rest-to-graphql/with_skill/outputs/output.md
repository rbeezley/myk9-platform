# REST to GraphQL Migration Plan

## Context

Migrate 12 REST endpoints across two routers (User API and Product API) to GraphQL. The frontend is React with React Query. REST endpoints must remain operational throughout the migration so existing clients are not disrupted.

---

## Phase 1: Foundation — GraphQL Server Setup

**Goal:** Stand up a GraphQL server alongside the existing REST API with no user-facing changes.

1. **Install dependencies:** `graphql`, `@apollo/server` (or `graphql-yoga`), `@graphql-codegen/cli` with TypeScript plugin.
2. **Mount the GraphQL endpoint** at `/graphql` on the same Express/Fastify server that hosts the REST routers. Both REST and GraphQL run in the same process and share middleware (auth, logging, rate-limiting).
3. **Create a minimal schema** (`schema.graphql`) with a single health-check query (`query { _health }`) to validate the server boots and responds.
4. **Configure codegen** to produce TypeScript types from the schema, integrated into the existing `pnpm typecheck` pipeline.
5. **Add integration test** that hits `/graphql` with the health query and asserts a 200 response.

**Exit criteria:** `/graphql` responds, all existing REST endpoints still pass their tests.

---

## Phase 2: Schema Design & Resolver Layer

**Goal:** Define the full GraphQL schema covering all 12 REST endpoints and wire up resolvers that delegate to existing service/data layer.

### 2a. Inventory the 12 REST endpoints

| #   | Router  | Method | Path                  | GraphQL operation                 |
| --- | ------- | ------ | --------------------- | --------------------------------- |
| 1   | User    | GET    | /users                | `query users`                     |
| 2   | User    | GET    | /users/:id            | `query user(id)`                  |
| 3   | User    | POST   | /users                | `mutation createUser`             |
| 4   | User    | PUT    | /users/:id            | `mutation updateUser`             |
| 5   | User    | DELETE | /users/:id            | `mutation deleteUser`             |
| 6   | User    | GET    | /users/:id/profile    | `query userProfile(userId)`       |
| 7   | Product | GET    | /products             | `query products`                  |
| 8   | Product | GET    | /products/:id         | `query product(id)`               |
| 9   | Product | POST   | /products             | `mutation createProduct`          |
| 10  | Product | PUT    | /products/:id         | `mutation updateProduct`          |
| 11  | Product | DELETE | /products/:id         | `mutation deleteProduct`          |
| 12  | Product | GET    | /products/:id/reviews | `query productReviews(productId)` |

### 2b. Write the schema

- Define `type User`, `type UserProfile`, `type Product`, `type Review` with all fields currently returned by REST.
- Define `input CreateUserInput`, `input UpdateUserInput`, `input CreateProductInput`, `input UpdateProductInput` for mutations.
- Add pagination arguments (`first`, `after` cursor) to list queries.
- Add filtering/sorting arguments where the REST endpoints accept query params (e.g., `?status=active`, `?sort=name`).

### 2c. Implement resolvers

- Resolvers call the **same service functions** the REST controllers call — no duplicated business logic.
- Authentication/authorization is handled via a shared context factory that extracts the user from the request (same middleware the REST routes use).
- Error handling: map service-layer errors to GraphQL errors with appropriate extensions (`code`, `status`).

### 2d. Testing

- Unit tests for each resolver (mock service layer, assert correct delegation and response shape).
- Integration tests that send GraphQL operations through the HTTP layer and validate full response.

**Exit criteria:** All 12 operations work via GraphQL; REST endpoints unchanged and still passing.

---

## Phase 3: Frontend Migration (React Query)

**Goal:** Migrate the React frontend from REST calls to GraphQL calls, one domain at a time, behind feature flags.

### 3a. Install frontend GraphQL tooling

- Install `graphql-request` (lightweight) or `@apollo/client`.
- Configure codegen on the frontend to generate typed hooks from `.graphql` operation documents.
- Create a shared GraphQL client instance configured with the same auth headers the current REST fetch client uses.

### 3b. Write operation documents

- Create `.graphql` files for each query/mutation (e.g., `GetUsers.graphql`, `CreateProduct.graphql`).
- Run codegen to produce typed React Query hooks (using `@graphql-codegen/typescript-react-query` or equivalent).

### 3c. Migrate by domain, behind feature flags

**Order:** Users first (simpler, lower risk), then Products.

For each endpoint:

1. Create the new GraphQL-based React Query hook (e.g., `useUsersGraphQL`).
2. Add a feature flag (`VITE_USE_GRAPHQL_USERS=true`) that toggles between old REST hook and new GraphQL hook.
3. Update the consuming components to use a wrapper hook that checks the flag.
4. Test with the flag on and off.
5. Once validated in staging, enable the flag. Existing REST hook remains in code but unused.

### 3d. React Query cache key strategy

- GraphQL hooks use new cache key prefixes (e.g., `['gql', 'users']` vs. `['rest', 'users']`) to avoid cache collisions during the transition period.
- Invalidation logic is updated in mutations to invalidate both REST and GraphQL keys while both exist.

### 3e. Testing

- Unit tests for each new hook.
- E2E tests run with both flag states (on/off) to confirm parity.

**Exit criteria:** Frontend works entirely through GraphQL with flags on; flipping flags off reverts to REST with no breakage.

---

## Phase 4: Validation & Parallel Running

**Goal:** Confirm GraphQL responses match REST responses in production-like conditions.

1. **Shadow testing:** In staging, run a middleware that sends every REST request to both the REST handler and the GraphQL resolver, then compares responses. Log any mismatches.
2. **Performance benchmarking:** Measure response times for equivalent REST vs. GraphQL operations. Identify any N+1 query issues in resolvers and add DataLoader batching where needed.
3. **Error parity:** Verify that error codes, messages, and HTTP status semantics (via GraphQL extensions) match what the frontend expects.
4. **Load testing:** Run load tests against both endpoints to confirm the GraphQL path handles the same throughput.

**Exit criteria:** Zero mismatches in shadow testing over a defined soak period (e.g., 1 week in staging). Performance is within acceptable thresholds.

---

## Phase 5: REST Deprecation & Cleanup

**Goal:** Remove REST endpoints and feature-flag scaffolding once all clients have migrated.

1. **Add deprecation headers** to REST responses (`Deprecation: true`, `Sunset: <date>`). Log usage of deprecated endpoints.
2. **Monitor REST traffic.** Do not remove endpoints until traffic drops to zero (or only known internal callers remain that have migrated).
3. **Remove feature flags** from the frontend — the GraphQL path becomes the only path.
4. **Remove REST route handlers** and their tests.
5. **Remove the wrapper hooks** and rename GraphQL hooks to the canonical names (e.g., `useUsersGraphQL` becomes `useUsers`).
6. **Remove REST-specific cache keys** and dual-invalidation logic from React Query.
7. **Update API documentation** to reflect GraphQL-only surface.

**Exit criteria:** No REST routes remain. Frontend uses GraphQL exclusively. All tests pass. Documentation updated.

---

## Risk Mitigations

| Risk                                            | Mitigation                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Breaking existing clients during migration      | REST endpoints remain fully operational throughout; feature flags allow instant rollback on the frontend |
| Schema drift between REST and GraphQL           | Resolvers share the same service layer — single source of truth for business logic                       |
| N+1 queries in GraphQL resolvers                | DataLoader batching added in Phase 4; performance benchmarks gate the rollout                            |
| Cache inconsistency during dual-mode            | Separate cache key namespaces; dual invalidation in mutations                                            |
| Auth/authz differences between REST and GraphQL | Shared context factory uses same middleware; integration tests cover auth scenarios                      |
| Incomplete endpoint coverage                    | Inventory table in Phase 2a maps every REST endpoint to a GraphQL operation                              |

---

## Timeline Estimate

| Phase                       | Duration        | Dependencies      |
| --------------------------- | --------------- | ----------------- |
| Phase 1: Foundation         | 1-2 days        | None              |
| Phase 2: Schema & Resolvers | 3-5 days        | Phase 1           |
| Phase 3: Frontend Migration | 5-7 days        | Phase 2           |
| Phase 4: Validation         | 3-5 days        | Phase 3           |
| Phase 5: Cleanup            | 1-2 days        | Phase 4 validated |
| **Total**                   | **~13-21 days** |                   |

---

---

## Plan Verification

### Requirements Extracted from Original Request

1. **Migrate user and product APIs from REST to GraphQL** (explicit)
2. **12 REST endpoints across two routers** (explicit constraint)
3. **Frontend is React with React Query** (explicit technology constraint)
4. **Keep REST endpoints working during migration** (explicit — backward compatibility)
5. **Nothing breaks for existing clients** (explicit success criterion)
6. **Implied: rollback strategy** if GraphQL path has issues
7. **Implied: type safety** preserved (TypeScript codebase per CLAUDE.md)
8. **Implied: testing** at each phase to confirm parity
9. **Implied: auth/authz continuity** between REST and GraphQL
10. **Implied: performance parity** — GraphQL should not degrade performance

### Requirements Audit

| Requirement                                  | Status      | Evidence                                                                                                                                                                                                            |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrate user and product APIs to GraphQL     | **Covered** | Phase 2a inventory table maps all 12 REST endpoints to GraphQL operations; Phase 2b-2c implement schema and resolvers                                                                                               |
| 12 REST endpoints across two routers         | **Covered** | Phase 2a table explicitly lists all 12 (6 User, 6 Product) with method, path, and GraphQL operation                                                                                                                 |
| Frontend is React with React Query           | **Covered** | Phase 3a installs GraphQL tooling for React; Phase 3b generates typed React Query hooks; Phase 3d addresses cache key strategy                                                                                      |
| Keep REST endpoints working during migration | **Covered** | Phase 1 exit criteria: "all existing REST endpoints still pass their tests"; Phase 2 exit criteria: "REST endpoints unchanged and still passing"; Phase 5 only removes REST after traffic drops to zero             |
| Nothing breaks for existing clients          | **Covered** | Feature flags in Phase 3c allow instant rollback; shadow testing in Phase 4.1 catches mismatches; deprecation headers and traffic monitoring in Phase 5 before removal                                              |
| Rollback strategy                            | **Covered** | Phase 3c: "feature flag... toggles between old REST hook and new GraphQL hook"; Phase 3e: "flipping flags off reverts to REST with no breakage"                                                                     |
| Type safety                                  | **Covered** | Phase 1.4: "Configure codegen to produce TypeScript types from the schema, integrated into pnpm typecheck"; Phase 3b: "Run codegen to produce typed React Query hooks"                                              |
| Testing at each phase                        | **Covered** | Phase 1.5 (integration test), Phase 2d (unit + integration), Phase 3e (unit + E2E both flag states), Phase 4 (shadow, perf, load)                                                                                   |
| Auth/authz continuity                        | **Covered** | Phase 2c: "shared context factory that extracts the user from the request (same middleware)"; Risk table: "Shared context factory uses same middleware; integration tests cover auth scenarios"                     |
| Performance parity                           | **Covered** | Phase 4.2: "Performance benchmarking... Identify N+1 query issues... add DataLoader batching"; Phase 4.4: load testing; Risk table: "DataLoader batching added in Phase 4; performance benchmarks gate the rollout" |

### Coverage: 100/100

All 10 requirements (explicit and implied) are covered with specific citations to plan sections. Each phase has clear exit criteria, and the risk mitigation table addresses cross-cutting concerns.

### Top Gaps

No gaps identified. All requirements are fully covered with citations.

### Patched Plan

No patches needed — coverage is 100%.
