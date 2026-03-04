# REST to GraphQL Migration Plan

## Context

Migrate 12 REST endpoints across two routers (User API and Product API) to GraphQL. The frontend is React with React Query. REST endpoints must remain operational throughout the migration to avoid breaking existing clients.

---

## Phase 1: Foundation & Schema Design (Week 1)

### 1.1 Install and Configure GraphQL Server

- Add `@apollo/server` (or `graphql-yoga`) and `graphql` as dependencies.
- Create a `/graphql` endpoint that runs alongside existing REST routes.
- Configure CORS, authentication middleware, and error handling to match what REST already provides.
- Set up GraphQL Playground/Explorer for development (disable in production).

### 1.2 Design the GraphQL Schema

Inventory the 12 REST endpoints and map them to GraphQL operations:

**User Router (estimated 6 endpoints):**

| REST Endpoint            | Method | GraphQL Operation                              | Type          |
| ------------------------ | ------ | ---------------------------------------------- | ------------- |
| `GET /users`             | GET    | `users(filter, pagination)`                    | Query         |
| `GET /users/:id`         | GET    | `user(id: ID!)`                                | Query         |
| `POST /users`            | POST   | `createUser(input: CreateUserInput!)`          | Mutation      |
| `PUT /users/:id`         | PUT    | `updateUser(id: ID!, input: UpdateUserInput!)` | Mutation      |
| `DELETE /users/:id`      | DELETE | `deleteUser(id: ID!)`                          | Mutation      |
| `GET /users/:id/profile` | GET    | Nested field on `User` type                    | Query (field) |

**Product Router (estimated 6 endpoints):**

| REST Endpoint               | Method | GraphQL Operation                                    | Type          |
| --------------------------- | ------ | ---------------------------------------------------- | ------------- |
| `GET /products`             | GET    | `products(filter, pagination)`                       | Query         |
| `GET /products/:id`         | GET    | `product(id: ID!)`                                   | Query         |
| `POST /products`            | POST   | `createProduct(input: CreateProductInput!)`          | Mutation      |
| `PUT /products/:id`         | PUT    | `updateProduct(id: ID!, input: UpdateProductInput!)` | Mutation      |
| `DELETE /products/:id`      | DELETE | `deleteProduct(id: ID!)`                             | Mutation      |
| `GET /products/:id/reviews` | GET    | Nested field on `Product` type                       | Query (field) |

> **Action item:** Audit the actual 12 endpoints and adjust this mapping. Some endpoints may be search, batch, or relationship endpoints that need different treatment.

### 1.3 Define TypeScript Types and Schema SDL

- Write `.graphql` SDL files (or use code-first with `type-graphql` / `nexus` if preferred).
- Generate TypeScript types from the schema using `@graphql-codegen/cli`.
- Ensure input types use `Input` suffix convention (`CreateUserInput`, `UpdateProductInput`).
- Define shared types: pagination (`PageInfo`, `Connection`/`Edge` for cursor-based), filtering, sorting.

### 1.4 Set Up Code Generation Pipeline

```bash
pnpm add -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations @graphql-codegen/typescript-react-query
```

- Configure `codegen.ts` to output:
  - Server-side types (for resolvers)
  - Client-side types + React Query hooks (for frontend)
- Add `pnpm codegen` script and integrate into dev workflow.

---

## Phase 2: Server-Side Implementation (Week 2)

### 2.1 Implement Resolvers

- Create resolver files organized by domain: `resolvers/user.ts`, `resolvers/product.ts`.
- Resolvers call the same service/data layer the REST controllers use -- do NOT duplicate business logic.
- Extract shared business logic from REST controllers into a service layer if not already separated.

### 2.2 Authentication & Authorization

- Reuse the existing auth middleware. Pass the authenticated user into the GraphQL context.
- Apply per-field or per-resolver authorization using directives (`@auth`, `@hasRole`) or resolver-level checks.
- Ensure error responses for unauthorized access match REST behavior (401/403 equivalent GraphQL errors with proper `extensions.code`).

### 2.3 Implement DataLoader for N+1 Prevention

- Add `dataloader` package.
- Create loaders for each entity (`userLoader`, `productLoader`) to batch and cache DB reads within a single request.
- Attach loaders to the GraphQL context, created fresh per request.

### 2.4 Error Handling

- Define a consistent error format using GraphQL error extensions:
  ```json
  {
    "errors": [
      {
        "message": "User not found",
        "extensions": { "code": "NOT_FOUND", "statusCode": 404 }
      }
    ]
  }
  ```
- Map existing REST error codes/messages to GraphQL error extensions.
- Add a global error formatter to sanitize internal errors in production.

### 2.5 Pagination

- Implement cursor-based pagination (Relay Connection spec) for list queries.
- Support `first`, `after`, `last`, `before` arguments.
- Return `PageInfo { hasNextPage, hasPreviousPage, startCursor, endCursor }`.
- Optionally support offset-based pagination (`limit`/`offset`) if the frontend currently uses it, to ease transition.

### 2.6 Input Validation

- Validate inputs at the GraphQL layer (custom scalars for email, URL, etc., or resolver-level validation).
- Reuse existing validation logic from REST controllers where possible.
- Return validation errors as structured GraphQL errors with field-level detail.

---

## Phase 3: Frontend Migration (Week 3-4)

### 3.1 Set Up GraphQL Client

- Install `graphql-request` or `@apollo/client` (lightweight option: `graphql-request` + React Query).
- Configure the client with the `/graphql` endpoint and auth headers.
- If using React Query, create a generic `useGraphQL` hook or use codegen-generated hooks.

### 3.2 Generate Typed React Query Hooks

- Write `.graphql` operation documents for each query/mutation.
- Run codegen to produce typed React Query hooks (e.g., `useUsersQuery`, `useCreateUserMutation`).
- These hooks replace the existing REST-based React Query hooks one at a time.

### 3.3 Migrate Queries Incrementally (One Endpoint at a Time)

**Migration order (lowest risk first):**

1. Read-only list queries (`users`, `products`) -- easy to verify, no side effects.
2. Read-only detail queries (`user(id)`, `product(id)`) -- simple, single-entity.
3. Nested/relationship queries (profile, reviews) -- leverage GraphQL's strength.
4. Create mutations -- test with non-critical flows first.
5. Update mutations -- higher risk, test thoroughly.
6. Delete mutations -- highest risk, migrate last.

**For each endpoint:**

- Write the GraphQL operation document.
- Generate the typed hook.
- Replace the REST call in the component.
- Verify cache invalidation still works (React Query key changes).
- Test the feature end-to-end.
- Keep the REST hook available as a fallback (feature flag or comment).

### 3.4 Update React Query Cache Keys and Invalidation

- GraphQL queries use different cache keys than REST queries. Update `queryClient.invalidateQueries()` calls.
- If using codegen hooks, cache keys are auto-generated. Ensure mutations invalidate the correct query keys.
- Consider a transition period where both REST and GraphQL cache keys may coexist.

### 3.5 Feature Flags (Optional but Recommended)

- Add a `USE_GRAPHQL` environment variable or feature flag.
- Wrap migrated calls so you can toggle back to REST if issues arise in staging/production.
- Remove flags once migration is validated.

---

## Phase 4: Testing & Validation (Ongoing, Intensifies Week 4)

### 4.1 Server-Side Tests

- Unit test each resolver (mock the service layer).
- Integration test the GraphQL endpoint (send actual GraphQL queries, assert responses).
- Test error cases: not found, unauthorized, validation errors, malformed queries.
- Test pagination edge cases: empty results, single page, last page.

### 4.2 Frontend Tests

- Update existing component tests to mock GraphQL responses instead of REST.
- E2E tests should be unaffected if the UI behavior doesn't change -- run the full suite.
- Add specific E2E tests for GraphQL-powered flows if coverage is lacking.

### 4.3 Parity Testing

- For each migrated endpoint, compare REST and GraphQL responses side-by-side.
- Write a script or test that calls both REST and GraphQL for the same input and diffs the output.
- Ensure field names, data shapes, and edge cases match.

### 4.4 Performance Testing

- Measure response times for GraphQL vs REST for equivalent operations.
- Check for N+1 query issues using query logging.
- Verify DataLoader is batching correctly.
- Test with realistic data volumes.

---

## Phase 5: Cleanup & Deprecation (Week 5+)

### 5.1 Deprecate REST Endpoints

- Once all frontend code uses GraphQL and is validated in production:
  - Add deprecation headers to REST responses (`Deprecation: true`, `Sunset: <date>`).
  - Log usage of REST endpoints to monitor external/legacy clients.
  - Set a sunset date (e.g., 90 days).

### 5.2 Remove REST Code

- After the sunset period and confirming zero REST traffic:
  - Remove REST route handlers.
  - Remove REST-specific middleware (if not shared with GraphQL).
  - Remove REST-related tests.
  - Remove feature flags and fallback code.

### 5.3 Final Cleanup

- Remove unused dependencies (`express-router` specifics, REST-only validation libraries).
- Update documentation (API docs, README, developer guides).
- Archive or delete REST-related codegen/types.

---

## Risk Mitigation

| Risk                                        | Mitigation                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Breaking existing clients during migration  | REST endpoints remain fully operational until explicitly removed. Frontend migrates incrementally.    |
| Data inconsistency between REST and GraphQL | Both layers call the same service/data layer. Parity tests catch divergence.                          |
| Performance regression                      | DataLoader prevents N+1. Performance testing before switching. Query complexity limits prevent abuse. |
| Auth/authz gaps in GraphQL                  | Reuse existing auth middleware. Per-resolver authorization tests. Security review before launch.      |
| Cache invalidation bugs on frontend         | Careful mapping of React Query keys. Test each mutation's invalidation. Feature flags allow rollback. |
| Team unfamiliarity with GraphQL             | Pair programming during initial setup. Documentation of patterns. Code review checklist.              |

---

## Deliverables Checklist

- [ ] GraphQL server running alongside REST at `/graphql`
- [ ] SDL schema covering all 12 endpoints
- [ ] TypeScript codegen for server and client types
- [ ] Resolvers for all queries and mutations
- [ ] DataLoader for N+1 prevention
- [ ] Authentication/authorization in GraphQL context
- [ ] Cursor-based pagination
- [ ] Input validation with structured errors
- [ ] GraphQL client configured in frontend
- [ ] Generated React Query hooks for all operations
- [ ] All 12 REST calls replaced with GraphQL in frontend
- [ ] Parity tests confirming identical behavior
- [ ] Performance benchmarks showing no regression
- [ ] REST deprecation headers added
- [ ] Documentation updated

---

# Plan Verification

## Requirements Coverage Check

| Requirement                                    | Addressed? | Where                                                                             |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| 12 REST endpoints across two routers           | Yes        | Phase 1.2 -- full endpoint mapping                                                |
| React + React Query frontend                   | Yes        | Phase 3 -- codegen hooks, cache key migration                                     |
| REST endpoints remain working during migration | Yes        | Core principle throughout; Phase 5 handles deprecation only after full validation |
| Incremental migration (nothing breaks)         | Yes        | Phase 3.3 -- one endpoint at a time, feature flags                                |

## Gap Analysis

### Gaps Found and Addressed in Plan

1. **Cache invalidation during coexistence**: When some queries use REST keys and others use GraphQL keys, a mutation via GraphQL might not invalidate a still-active REST query cache (or vice versa). **Addressed in Phase 3.4** but deserves extra emphasis -- during the transition, mutation handlers should invalidate BOTH REST and GraphQL query keys.

2. **File uploads**: If any of the 12 endpoints handle file uploads (e.g., user avatar, product images), GraphQL requires special handling (`graphql-upload` or multipart request spec). **Gap: Not explicitly addressed.** The plan should audit endpoints for file upload support and handle it if needed.

3. **Rate limiting / query complexity**: GraphQL opens the door to expensive nested queries. **Gap: Not explicitly addressed.** Add query depth limiting and complexity analysis (e.g., `graphql-query-complexity`) to prevent abuse.

4. **Subscriptions**: If any endpoints use WebSockets or SSE for real-time updates, GraphQL Subscriptions should be considered. **Gap: Not explicitly addressed.** Audit for real-time requirements.

5. **API versioning**: REST APIs may be versioned (e.g., `/v1/users`). GraphQL uses schema evolution instead. **Gap: Not explicitly addressed.** Document how schema changes will be handled (deprecation of fields, additive changes only).

6. **External/third-party consumers**: The plan assumes only the React frontend consumes the REST API. If there are external consumers (mobile apps, partner integrations, webhooks), the deprecation timeline needs coordination with them. **Gap: Partially addressed** in Phase 5 (monitoring REST traffic) but should be called out as a prerequisite check.

7. **Monitoring and observability**: GraphQL requests all hit a single `/graphql` endpoint, making traditional HTTP monitoring (by URL path) less useful. **Gap: Not explicitly addressed.** Add operation-name-based monitoring, query tracing (Apollo Studio, or custom middleware), and error tracking by operation.

8. **Batch operations**: If any REST endpoints support batch creates/updates (e.g., `POST /products/batch`), these need explicit GraphQL treatment (either multiple mutations or a dedicated batch mutation). **Gap: Not explicitly addressed.** Audit endpoints for batch operations.

### Implied Requirements Not Explicitly Stated

9. **Developer experience**: The plan should ensure `pnpm codegen` runs in watch mode during development so types stay in sync as the schema evolves.

10. **CI integration**: Codegen output should either be committed or regenerated in CI. Add a CI step that runs codegen and fails if the output differs from what's committed (prevents stale types).

11. **Rollback plan**: If the GraphQL layer has a critical bug post-migration, the rollback is: revert frontend to REST hooks (via feature flag or git revert). This should be documented as an explicit runbook.

## Recommended Additions

Based on the gap analysis above, add these items:

1. **Phase 1 addition**: Audit all 12 endpoints for file uploads, batch operations, real-time/streaming, and external consumers.
2. **Phase 2 addition**: Add query depth limiting (`graphql-depth-limit`) and complexity analysis.
3. **Phase 2 addition**: Add operation-name-based logging and monitoring middleware.
4. **Phase 3 addition**: During coexistence, mutations must invalidate both REST and GraphQL React Query cache keys.
5. **Phase 4 addition**: CI step for codegen freshness check.
6. **Phase 5 addition**: Document schema evolution policy (additive only, field deprecation with `@deprecated` directive).
7. **Pre-migration**: Identify all REST API consumers (not just the React frontend) and communicate the migration timeline.

## Edge Cases to Test

- Empty collections (no users, no products)
- Deeply nested queries (user -> products -> reviews -> user -- circular references)
- Concurrent mutations on the same entity
- Large result sets (pagination boundary conditions)
- Invalid cursors in pagination
- Expired/invalid auth tokens
- Partial failures in batch-like operations
- Unicode and special characters in string fields
- Null vs. undefined vs. empty string in optional fields
- GraphQL query syntax errors (malformed queries from clients)

## Conclusion

The plan covers the core migration path comprehensively. The main gaps are around operational concerns (monitoring, rate limiting, file uploads) and coexistence edge cases (dual cache invalidation, external consumers). Addressing the 7 recommended additions above would make the plan production-ready.
