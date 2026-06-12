# Code Quality Wave B: Replication Read-Shape Parity

## Objective

Complete the Phase 2 confirmed `Replication/PostgREST read-shape duplication` item from the June 2026 code-quality audit without introducing a broad ORM.

## Scope

- Add narrow shared helpers for replication-first read result envelopes, lookup-map loading, and deterministic sort parity.
- Refactor duplicated patterns in:
  - `apps/myk9show/src/services/database/entries/reads.ts`
  - `apps/myk9show/src/services/database/classes/reads.ts`
  - `apps/myk9show/src/services/database/dogs/reads.ts`
  - `apps/myk9show/src/services/database/trials/reads.ts`
- Preserve all domain-specific mappers, PostgREST select strings, mutation behavior, and offline-first read paths.
- Update audit tracking docs after implementation.

## Non-Goals

- Do not create a generic query builder or ORM.
- Do not migrate additional tables to replication.
- Do not change write/mutation paths.
- Do not change user-facing behavior except fixing documented ordering parity where the replicated read path currently differs from the PostgREST fallback.

## Implementation Plan

1. Add a small helper module under `apps/myk9show/src/services/database/_shared/`.
2. Move repeated `try -> withReplicationFallback -> catch { data, error }` handling into a typed helper.
3. Add lookup-map and sorted-copy helpers so read modules do not hand-roll the same map/sort patterns.
4. Refactor the four read modules to use the helpers while keeping local mapping code explicit.
5. Make ordering parity explicit for high-risk replicated reads:
   - entries ordered by `created_at` descending where PostgREST fallback orders that way
   - entries by class ordered by `run_order` ascending with nulls last
   - classes ordered by `start_time` ascending where PostgREST fallback orders that way
   - dogs ordered by `name` ascending
   - trials ordered by `date` ascending where PostgREST fallback orders that way

## Testing Plan

1. Add helper-level tests for:
   - successful replication result without PostgREST fallback
   - PostgREST fallback when replication throws
   - error result shape when both paths fail
   - lookup map construction
   - immutable sorted-copy behavior and nulls-last run-order sorting
2. Add focused domain parity tests for replicated ordering in the existing query replication suites.
3. Run:

```bash
cd apps/myk9show
npx vitest run \
  src/services/database/_shared/read-shape.test.ts \
  src/test/services/database/queries/entryQueries.replication.test.ts \
  src/test/services/database/queries/classQueries.replication.test.ts \
  src/test/services/database/queries/dogQueries.replication.test.ts \
  src/test/services/database/queries/trialQueries.replication.test.ts \
  src/services/database/_shared/replication-fallback.test.ts
```

4. Run monorepo typecheck and lint before PR.

## Completion Criteria

- Shared helper tests pass.
- Existing replication query tests pass with added ordering parity coverage.
- `pnpm typecheck` passes.
- `pnpm lint` has no new actionable issues.
- Audit docs reflect the completed Wave B read-shape parity slice.
