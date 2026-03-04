# REST to GraphQL Migration Plan

## Context

Migrate 12 REST endpoints across two routers (User API and Product API) to GraphQL while keeping the existing REST endpoints fully operational for existing clients. The frontend is React with React Query.

---

## Phase 1: Foundation Setup

### 1.1 Install and Configure GraphQL Server

- Add `@apollo/server` (or `graphql-yoga`) and `graphql` as dependencies.
- Create `src/graphql/index.ts` with the Apollo Server instance mounted alongside the existing Express/Fastify app (e.g., at `/graphql`).
- Configure CORS to match existing REST API CORS settings.
- Wire up the existing authentication middleware so the GraphQL context receives the same `user` object the REST controllers use.

### 1.2 Define Base Schema

- Create `src/graphql/schema/` directory with:
  - `user.graphql` — User type, queries (`user`, `users`, `me`), mutations (`createUser`, `updateUser`, `deleteUser`).
  - `product.graphql` — Product type, queries (`product`, `products`, `productsByCategory`), mutations (`createProduct`, `updateProduct`, `deleteProduct`).
  - `common.graphql` — Shared scalars (DateTime, JSON), pagination types (`PageInfo`, `Connection` / `Edge` pattern), error union types.
- Use code-first or schema-first approach consistently; schema-first recommended for readability.

### 1.3 Generate TypeScript Types

- Add `@graphql-codegen/cli` with `typescript`, `typescript-operations`, and `typescript-react-query` plugins.
- Create `codegen.yml` targeting `src/graphql/generated/`.
- Add `pnpm codegen` script and integrate into the dev workflow (watch mode optional).

---

## Phase 2: Implement Resolvers (Parallel with REST)

### 2.1 User Resolvers

Map each existing REST endpoint to its GraphQL equivalent:

| REST Endpoint       | Method | GraphQL Operation     |
| ------------------- | ------ | --------------------- |
| `GET /users`        | GET    | `Query.users`         |
| `GET /users/:id`    | GET    | `Query.user(id)`      |
| `GET /users/me`     | GET    | `Query.me`            |
| `POST /users`       | POST   | `Mutation.createUser` |
| `PUT /users/:id`    | PUT    | `Mutation.updateUser` |
| `DELETE /users/:id` | DELETE | `Mutation.deleteUser` |

- Resolvers call the **same service layer** the REST controllers call — no duplicated business logic.
- Add DataLoader for batching `user` lookups to prevent N+1 queries when products reference users.

### 2.2 Product Resolvers

| REST Endpoint              | Method | GraphQL Operation          |
| -------------------------- | ------ | -------------------------- |
| `GET /products`            | GET    | `Query.products`           |
| `GET /products/:id`        | GET    | `Query.product(id)`        |
| `GET /products?category=X` | GET    | `Query.products(category)` |
| `POST /products`           | POST   | `Mutation.createProduct`   |
| `PUT /products/:id`        | PUT    | `Mutation.updateProduct`   |
| `DELETE /products/:id`     | DELETE | `Mutation.deleteProduct`   |

- Resolvers delegate to the existing product service layer.
- Add DataLoader for batching product lookups.
- Implement pagination via cursor-based connections (Relay spec).

### 2.3 Error Handling in Resolvers

- Define a `UserError` interface with `message` and `code` fields for mutation results (union return types: `CreateUserPayload = User | UserError`).
- Map existing REST error codes (400, 404, 409, 422) to GraphQL error extensions with matching codes.
- Network / database failures surface as top-level GraphQL errors with `extensions.code = "INTERNAL_SERVER_ERROR"` — do not expose internal details.
- Validation errors return structured field-level errors (e.g., `{ field: "email", message: "already in use" }`).

### 2.4 Authorization

- Reuse the existing auth middleware by injecting the authenticated user into GraphQL context.
- Add resolver-level authorization checks using a `@auth(requires: ROLE)` directive or a `requireRole()` guard function.
- Ensure unauthenticated requests to protected queries/mutations return `UNAUTHENTICATED` error.
- Ensure users cannot access/modify other users' data unless they hold an admin role — mirror the REST authorization rules exactly.

---

## Phase 3: Frontend Migration

### 3.1 Set Up GraphQL Client

- Install `@apollo/client` or use `graphql-request` with the existing React Query setup.
- **Recommended approach:** Use `graphql-request` + React Query (preserves existing cache management, avoids two cache layers).
- Create `src/lib/graphqlClient.ts` that configures the client with the `/graphql` endpoint and attaches the auth token from the existing auth context.

### 3.2 Migrate Queries Incrementally

- For each screen/feature, replace the REST `useQuery` call with a GraphQL `useQuery` call:
  1. Write the `.graphql` document (or inline `gql` tag).
  2. Run codegen to produce the typed hook.
  3. Swap the hook in the component.
  4. Verify the component renders correctly with the new data shape.
- Migrate **read operations first** (queries), then **write operations** (mutations).
- Keep the old REST-based hook commented out (or behind a feature flag) until the GraphQL version is validated.

### 3.3 Update React Query Keys

- Establish a new query key factory: `graphqlKeys.users.list()`, `graphqlKeys.users.detail(id)`, etc.
- Ensure mutation `onSuccess` callbacks invalidate the correct GraphQL query keys.
- During the migration window, if a REST mutation fires, also invalidate related GraphQL query keys (and vice versa) to prevent stale data.

### 3.4 Feature Flag for Gradual Rollout

- Add a `USE_GRAPHQL` feature flag (environment variable or runtime config).
- Wrapper hooks (e.g., `useUsers()`) check the flag and delegate to either the REST hook or the GraphQL hook.
- This allows per-endpoint or per-feature rollout and instant rollback without a deploy.

---

## Phase 4: Validation and Coexistence

### 4.1 Parallel Running and Shadow Testing

- During the migration period, both `/api/users/*` and `/graphql` serve the same data.
- Add an optional "shadow mode" in staging: REST handler also fires the equivalent GraphQL query and logs any response discrepancies. This validates data parity before switching clients.

### 4.2 Testing Strategy

- **Unit tests:** Test each resolver in isolation with mocked services. Verify correct data shape, error mapping, and authorization checks.
- **Integration tests:** Hit the `/graphql` endpoint with test queries/mutations against a test database. Verify end-to-end data flow.
- **E2E tests:** Existing Playwright E2E tests continue to pass (they test UI behavior, agnostic to REST vs. GraphQL underneath).
- **Regression tests:** For each migrated endpoint, add a test that calls both the REST and GraphQL versions and asserts response equivalence.
- **Contract tests:** Schema snapshot tests to prevent accidental breaking changes to the GraphQL schema.

### 4.3 Monitoring and Observability

- Add logging to the GraphQL server plugin: log query name, duration, errors, and user ID.
- Track GraphQL error rates and latency in the same monitoring system used for REST.
- Set up alerts for GraphQL error rate exceeding baseline (e.g., >1% error rate).
- During migration, dashboard showing REST vs. GraphQL traffic split.

---

## Phase 5: Deprecation and Cleanup

### 5.1 Deprecation Timeline

- **Week 1-2:** GraphQL deployed alongside REST. Internal frontend migrates.
- **Week 3-4:** GraphQL validated via shadow testing and staging. Feature flag flipped to GraphQL for staging.
- **Week 5-6:** Feature flag flipped to GraphQL in production (per-endpoint rollout).
- **Week 7-8:** REST endpoints marked deprecated with `Sunset` header and logged usage tracking.
- **Week 9-12:** Monitor for remaining REST traffic. Communicate deprecation to any external consumers.
- **Week 12+:** Remove REST routers and related code once traffic drops to zero.

### 5.2 Cleanup Tasks

- Remove feature flag wrappers and REST hooks from frontend.
- Remove REST router files and controllers.
- Remove shadow testing code.
- Update API documentation to reflect GraphQL-only API.
- Archive REST-related tests.

---

## Phase 6: Performance Considerations [ADDED]

### 6.1 Query Complexity and Depth Limiting

- Configure query depth limiting (max depth: 7) and query complexity analysis to prevent abusive or accidental deeply nested queries.
- Set a maximum query complexity score (e.g., 1000) and reject queries exceeding it with a descriptive error.

### 6.2 DataLoader and N+1 Prevention

- Create DataLoader instances **per-request** (not global) to avoid cross-request cache pollution.
- Implement DataLoaders for: users-by-id, products-by-id, products-by-category.
- Add logging in development mode that warns when a field resolver fires more than 10 times without a DataLoader.

### 6.3 Caching Strategy

- Leverage React Query's existing cache for frontend caching (no Apollo cache needed if using `graphql-request`).
- Add `Cache-Control` headers to persisted query responses for CDN caching where appropriate.
- For the GraphQL server, consider Automatic Persisted Queries (APQ) to reduce request payload size and enable CDN caching of GET-based persisted queries.

### 6.4 Large Payloads

- Enforce pagination on all list queries (no unbounded result sets). Default page size: 20, max: 100.
- Return `totalCount` as a separate field that can be opted out of (it requires a COUNT query).

---

## Phase 7: Rollback Plan [ADDED]

### 7.1 Instant Rollback via Feature Flag

- The `USE_GRAPHQL` feature flag allows instant rollback at the frontend layer — flip it to `false` and the frontend reverts to REST hooks. No deploy required if using a runtime flag service.

### 7.2 Server-Side Rollback

- The GraphQL endpoint is additive (mounted at `/graphql`). Removing it does not affect REST.
- If the GraphQL server causes performance issues on the shared process, it can be disabled via an environment variable (`ENABLE_GRAPHQL=false`) that skips mounting the Apollo middleware.

### 7.3 Data Rollback

- No data migration is involved — both REST and GraphQL use the same database and service layer. There is no data to roll back.

### 7.4 Partial Failure During Migration

- If one resolver is buggy, the feature flag can be scoped per-domain (e.g., `USE_GRAPHQL_USERS=true`, `USE_GRAPHQL_PRODUCTS=false`) to roll back a single domain while keeping the other on GraphQL.

---

## Phase 8: Operational Concerns [ADDED]

### 8.1 Environment Variables

New environment variables needed:

| Variable                   | Purpose                                     | Required |
| -------------------------- | ------------------------------------------- | -------- |
| `GRAPHQL_PATH`             | Mount path for GraphQL (default `/graphql`) | No       |
| `ENABLE_GRAPHQL`           | Kill switch for GraphQL server              | No       |
| `USE_GRAPHQL`              | Frontend feature flag                       | No       |
| `GRAPHQL_COMPLEXITY_LIMIT` | Max query complexity (default 1000)         | No       |

### 8.2 Deployment Steps

1. Deploy backend with GraphQL server mounted (no frontend changes yet).
2. Verify `/graphql` endpoint responds to introspection (staging only) and health checks.
3. Deploy frontend with feature flag set to `false` (REST still used).
4. Flip feature flag to `true` for internal/beta users.
5. Monitor error rates and latency. Roll back if anomalies detected.
6. Gradually roll out to all users.

### 8.3 Introspection Security

- Disable introspection in production (`introspection: process.env.NODE_ENV !== 'production'`).
- Optionally enable it behind an admin auth check for debugging.

---

## Phase 9: Security Considerations [ADDED]

### 9.1 Input Validation

- All mutation inputs must be validated in the resolver (or by reusing existing service-layer validation). Do not rely solely on GraphQL type system for validation (e.g., `String` allows empty strings, `Int` allows negative numbers).
- Sanitize string inputs to prevent injection (same rules as REST controllers).

### 9.2 Rate Limiting

- Apply the same rate limiting to the `/graphql` endpoint as exists on the REST routes.
- Consider per-query rate limiting for expensive operations (e.g., `users` list query).

### 9.3 Query Batching Abuse

- If using Apollo Server's default batching, limit batch size (e.g., max 5 operations per batch) to prevent amplification attacks.

### 9.4 Secrets Management

- No new secrets required — GraphQL uses the same database credentials and auth tokens as REST.
- The `STRIPE_SECRET_KEY` and other existing secrets remain unchanged.

---

## Summary: Endpoint Mapping

| #   | REST Endpoint              | Method | GraphQL Operation          | Phase |
| --- | -------------------------- | ------ | -------------------------- | ----- |
| 1   | `GET /users`               | GET    | `Query.users`              | 2.1   |
| 2   | `GET /users/:id`           | GET    | `Query.user(id)`           | 2.1   |
| 3   | `GET /users/me`            | GET    | `Query.me`                 | 2.1   |
| 4   | `POST /users`              | POST   | `Mutation.createUser`      | 2.1   |
| 5   | `PUT /users/:id`           | PUT    | `Mutation.updateUser`      | 2.1   |
| 6   | `DELETE /users/:id`        | DELETE | `Mutation.deleteUser`      | 2.1   |
| 7   | `GET /products`            | GET    | `Query.products`           | 2.2   |
| 8   | `GET /products/:id`        | GET    | `Query.product(id)`        | 2.2   |
| 9   | `GET /products?category=X` | GET    | `Query.products(category)` | 2.2   |
| 10  | `POST /products`           | POST   | `Mutation.createProduct`   | 2.2   |
| 11  | `PUT /products/:id`        | PUT    | `Mutation.updateProduct`   | 2.2   |
| 12  | `DELETE /products/:id`     | DELETE | `Mutation.deleteProduct`   | 2.2   |

---

---

## Plan Verification

### Step 1: Extracted Requirements

**Explicit asks:**

1. Migrate 12 REST endpoints to GraphQL
2. Two routers: User API and Product API
3. Frontend is React with React Query
4. Keep REST endpoints working during migration (backward compatibility)

**Implied constraints:** 5. No downtime during migration 6. Type safety (TypeScript monorepo per CLAUDE.md) 7. Authentication/authorization must work identically in GraphQL 8. Error handling parity between REST and GraphQL 9. Performance must not degrade 10. Existing tests must continue to pass 11. Rollback capability if migration goes wrong 12. Operational readiness (deployment, monitoring, env vars) 13. Security parity (rate limiting, input validation, etc.) 14. Frontend data caching must work correctly during coexistence

**Edge cases mentioned or implied:** 15. Stale data during coexistence (REST mutation + GraphQL query or vice versa) 16. Partial migration state (some endpoints migrated, some not)

### Step 2: Stress-Test Against Gap Categories

| Category                      | Assessment                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Error handling**            | Plan addresses error mapping (Section 2.3), structured field errors, network failures. What about partial resolver failures in a single query (one field errors, others succeed)? |
| **Security**                  | Plan covers auth (2.4), input validation (9.1), rate limiting (9.2), introspection (8.3), query batching abuse (9.3). Depth/complexity limiting (6.1).                            |
| **Rollback / recovery**       | Feature flag rollback (7.1), server kill switch (7.2), no data migration needed (7.3), per-domain rollback (7.4).                                                                 |
| **Operational concerns**      | Env vars (8.1), deployment steps (8.2), monitoring (4.3).                                                                                                                         |
| **Testing strategy**          | Unit, integration, E2E, regression, contract tests all covered (4.2).                                                                                                             |
| **Edge cases**                | Cross-cache invalidation during coexistence (3.3), partial migration (3.4/7.4). Empty result sets not explicitly mentioned. Concurrent mutations not discussed.                   |
| **Migration / compatibility** | Deprecation timeline (5.1), backward compat via parallel running (4.1), feature flags (3.4).                                                                                      |
| **Performance**               | DataLoader (2.1, 6.2), depth limiting (6.1), pagination (6.4), caching (6.3), APQ (6.3).                                                                                          |

### Step 3: Requirements Audit

| Requirement                                        | Status      | Evidence                                                                                                                                                                                  |
| -------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Migrate 12 REST endpoints to GraphQL            | **Covered** | Summary table maps all 12 endpoints; Phases 2.1 and 2.2 detail each resolver                                                                                                              |
| 2. Two routers (User, Product)                     | **Covered** | Schema split into `user.graphql` and `product.graphql` (Phase 1.2); resolvers split by domain (2.1, 2.2)                                                                                  |
| 3. React + React Query frontend                    | **Covered** | Phase 3.1 recommends `graphql-request` + React Query; Phase 3.2 details hook migration; Phase 3.3 covers query key management                                                             |
| 4. Keep REST endpoints working during migration    | **Covered** | Phase 4.1 states both endpoints serve simultaneously; Phase 5.1 defines deprecation timeline; Phase 7.2 confirms GraphQL is additive                                                      |
| 5. No downtime                                     | **Covered** | Additive deployment (8.2 step 1 deploys backend first, no frontend changes); feature flag controls rollout (3.4)                                                                          |
| 6. Type safety                                     | **Covered** | Codegen with TypeScript plugins (Phase 1.3); generated typed hooks                                                                                                                        |
| 7. Auth/authz parity                               | **Covered** | Phase 2.4 details context injection, directive/guard pattern, and mirrors REST rules; failure mode (UNAUTHENTICATED error) specified                                                      |
| 8. Error handling parity                           | **Covered** | Phase 2.3 maps REST error codes to GraphQL extensions, structured field errors, network error handling                                                                                    |
| 9. Performance                                     | **Covered** | Phase 6 covers depth limiting (6.1), DataLoader (6.2), caching (6.3), pagination (6.4)                                                                                                    |
| 10. Existing tests pass                            | **Covered** | Phase 4.2 states E2E tests are UI-level and agnostic to transport; regression tests added for parity                                                                                      |
| 11. Rollback capability                            | **Covered** | Phase 7 covers feature flag rollback (7.1), server kill switch (7.2), no data rollback needed (7.3), per-domain scoping (7.4)                                                             |
| 12. Operational readiness                          | **Covered** | Phase 8 covers env vars (8.1), deployment steps (8.2), introspection security (8.3); Phase 4.3 covers monitoring                                                                          |
| 13. Security parity                                | **Covered** | Phase 9 covers input validation (9.1), rate limiting (9.2), batch abuse (9.3), secrets (9.4); Phase 8.3 covers introspection                                                              |
| 14. Frontend caching during coexistence            | **Covered** | Phase 3.3 explicitly addresses cross-invalidation of REST and GraphQL query keys during migration window                                                                                  |
| 15. Stale data during coexistence                  | **Covered** | Phase 3.3 addresses cross-cache invalidation; Phase 4.1 shadow testing validates data parity                                                                                              |
| 16. Partial migration state                        | **Covered** | Phase 3.4 feature flag per-endpoint; Phase 7.4 per-domain rollback                                                                                                                        |
| 17. Partial resolver failure within a query        | **Partial** | Phase 2.3 covers error mapping generally but does not explicitly address GraphQL's nullable field behavior when one resolver in a compound query fails while others succeed               |
| 18. Concurrent mutation handling                   | **Partial** | Not explicitly addressed — REST presumably handles this already via the service layer, but GraphQL batched mutations could introduce new ordering concerns                                |
| 19. Schema versioning / breaking change prevention | **Partial** | Contract tests mentioned (4.2) but no explicit policy on schema evolution (additive-only changes, deprecation of fields, etc.)                                                            |
| 20. File upload handling                           | **Missing** | If any REST endpoints accept file uploads (e.g., user avatar, product image), the plan does not address how these would work in GraphQL (multipart upload spec or separate REST endpoint) |
| 21. Empty state / zero-result handling             | **Partial** | Pagination mentioned (6.4) but no explicit discussion of how empty lists, null entities (deleted user), or not-found cases are represented in the schema                                  |

### Coverage: 82/100

The plan comprehensively covers all explicit requirements and most implied constraints. The gaps are in edge cases (partial resolver failures, concurrent mutations, file uploads, empty states) and schema evolution policy. The core migration path, coexistence strategy, rollback, testing, security, and performance are all well-addressed. The file upload gap could be blocking if any of the 12 endpoints handle uploads.

### Top Gaps

1. **File upload handling** — If any endpoint accepts file uploads, GraphQL requires a different approach (multipart spec or hybrid REST+GraphQL). Could be blocking.
2. **Partial resolver failure** — GraphQL returns partial data with errors by default; the plan should define nullable vs. non-nullable field strategy to control this behavior.
3. **Schema evolution policy** — Without a policy, someone could ship a breaking rename. Need additive-only rules + `@deprecated` directive usage.
4. **Concurrent/batched mutation ordering** — Apollo batching executes mutations in parallel by default; need to document expected behavior.
5. **Empty/not-found representation** — Should define whether not-found returns `null` or a union error type, consistently across all queries.

### Patched Plan

The following additions address the gaps identified above. They are integrated into the existing phase structure.

---

#### Phase 2.3 — Error Handling in Resolvers [EXPANDED]

**Partial Resolver Failures:**

- Define a clear nullable vs. non-nullable field strategy: root query fields that fetch a single entity (e.g., `user(id)`) return a **nullable** type so that a failure on one field does not null out the entire response. List fields return a **non-nullable** list of **non-nullable** items (`[Product!]!`) — an empty list is returned instead of null.
- When a nested resolver fails (e.g., `product.owner` fails to load), GraphQL will null that field and add an error to the `errors` array. Document this behavior for frontend consumers so they handle partial data gracefully.

**Not-Found Handling:**

- Queries for a single entity by ID (`user(id)`, `product(id)`) return `null` when the entity does not exist. The frontend must handle `null` responses (display "not found" UI, redirect, etc.).
- Mutations targeting a non-existent entity return a `UserError` with `code: "NOT_FOUND"`.

---

#### Phase 2.5 — File Upload Handling [ADDED]

- **Audit the 12 REST endpoints** to determine if any accept file uploads (multipart/form-data).
- If file uploads exist:
  - **Option A (recommended):** Keep file uploads on a dedicated REST endpoint (e.g., `POST /uploads`) and return a URL/ID. The GraphQL mutation then references the uploaded file by URL/ID. This avoids the complexity of `graphql-upload`.
  - **Option B:** Use `graphql-upload` (or the newer `graphql-scalars` Upload type) with Apollo Server's built-in multipart support. Configure max file size and allowed MIME types.
- If no file uploads exist, this section is a no-op.

---

#### Phase 2.6 — Concurrent and Batched Mutation Ordering [ADDED]

- If Apollo Server batching is enabled, mutations within a single batch are executed **sequentially** (per the GraphQL spec, unlike queries which may execute in parallel). Document this for consumers.
- However, **separate requests** arriving concurrently still hit the service layer in parallel (same as REST). The existing service layer's concurrency handling (optimistic locking, database constraints) applies unchanged.
- If batching is enabled (see 9.3 for the batch size limit), add a test that verifies sequential execution order of batched mutations.

---

#### Phase 5.1 — Deprecation Timeline [EXPANDED]

**Schema Evolution Policy:**

- All schema changes must be **additive only** during the migration period and afterward. No field removals or type renames without a deprecation cycle.
- To deprecate a field, add `@deprecated(reason: "Use newField instead")` and leave it functional for at least 2 release cycles.
- Schema snapshot tests (Phase 4.2 contract tests) will catch accidental removals or renames in CI.
- Document the schema evolution policy in the API docs so frontend developers and any future consumers know the rules.

---

#### Phase 6.4 — Large Payloads [EXPANDED]

**Empty State Handling:**

- All list queries return an empty list (`[]`) rather than `null` when there are no results. The connection type's `totalCount` returns `0` and `pageInfo.hasNextPage` returns `false`.
- Frontend components consuming list queries should render an empty state UI when the list is empty — this is the same behavior as the existing REST responses but should be explicitly tested during migration.
