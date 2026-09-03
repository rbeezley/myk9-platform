## Context

See proposal.md and the existing MYK9-328 inventories. The owner confirmed internal-only compatibility. Current production app entry points, package barrels, deep imports, tests, dynamic registries, and Edge Function references must all be checked before deletion.

## Goals / Non-Goals

Goals: remove verified dead code in independently verifiable package slices; preserve all mounted workflows and the public behavior of replicated reads.

Non-goals: redesign storage, change IndexedDB schema, alter retention/eviction policies, change mutation queues or auth, add UI, activate TTL, change live email output, or touch the legacy production repository. Existing role intent stays unchanged: reliable offline reads and uninterrupted scoring.

## Decisions

1. Record per-symbol production file counts and classify defining files, barrels, internal dead-cluster edges, tests, and live consumers. Use whole-word `rg` across apps/packages/supabase plus whole-repo path/dynamic checks. A zero external count alone is not sufficient when a runtime registry or side effect reaches the file. Retain any live symbol and record its path.
2. Delete dead modules and their dedicated tests together; trim root and subpath barrels. Preserve shared types/imports if any retained consumer needs them. Do not introduce a generalized replacement for unused utilities.
3. Remove TTL parameters, constants, filtering, maintenance methods, and injected providers only after tracing subclass constructors and cache callbacks. Keep replica timestamps for sync/conflict/observability, capacity eviction, dirty rows, deleted-row reconciliation, read provenance, and subscription error behavior. No wall-clock expiry replacement is required: authoritative sync and explicit lifecycle deletion remain the existing policy.
4. Test the public replicated-table read/subscription boundary with fake IndexedDB and controlled time/network. Keep existing sync/error/dirty-row coverage. Owner replied "continue" to the explicit test-boundary and publication/review/merge/Linear-closure approval request on 2026-09-03. Characterize the already-correct behavior before deletion; use a temporary expiry mutation to prove the safety assertion fails without wiring dormant TTL into production.
5. [EXPANDED] Choose the issue's types-only email option. The only runtime rendering consumers of package templates are tests; production uses Edge Function builders. Delete the React template/token duplicates and their dedicated tests, preserve the production half of the parity assertions and existing builder suites, and update obsolete ownership comments without changing HTML. Do not rewrite or deploy server rendering.

## Risks / Trade-offs

- Stale inventory or name collisions → inspect each match, deep imports, dynamic registration, aliases, and build configuration; build packages and typecheck the app.
- Lost offline data from expiry cleanup → do not call refresh/expiry methods, do not migrate or clear databases; verify aged reads online/offline and dirty/deleted behavior.
- Coverage artificially weakened → remove tests only for deleted subjects; preserve live tests and run package suites plus broad quality gates without lowering thresholds.
- Existing concurrent changes → isolated worktree; do not rewrite main or other agents' work. Recheck current main before publication.
- Email output drift → preserve production-content assertions and all builder suites; Edge Function changes are ownership comments only, no HTML edits or deployment.

## Migration Plan

No data migration or shared-system deployment. Review each package slice, run builds/tests/typechecks/lint/ratchet, then publish only under explicit shared-system approval. Require independent review, green CI, and confirmed merge before archive or final tracking closure. Roll back via a normal Git revert of the affected slice; stored data is untouched.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: shared package APIs and offline replication read paths require package suites and monorepo checks even though deletion is behavior-preserving.
