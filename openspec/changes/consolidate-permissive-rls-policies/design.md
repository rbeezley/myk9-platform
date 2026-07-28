## Context

MYK9-112 was split from the mechanical `auth_rls_initplan` cleanup because permissive-policy consolidation can change access when policy roles or commands differ. A read-only `pg_policies` inventory against the linked project on 2026-07-28 found 70 policies on the 23 affected tables and confirmed three recurring overlap shapes:

1. Multiple policies for the same role and command whose predicates must be OR-ed.
2. An authenticated `ALL` management policy overlapping a broader `SELECT` policy.
3. Role-sensitive cases where a `public` policy overlaps an `authenticated` policy.

The Supabase advisor expands `TO public` across hosted roles including `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, and `supabase_privileged_role`. The migration must preserve the universal public predicate for every such role, even when application API traffic normally uses only `anon` and `authenticated`. It must also leave grants, FORCE RLS state, helpers, and unaffected policies unchanged.

Core show-day reads and writes continue through the existing replication-backed paths. This change only reduces server-side policy evaluation; it does not alter replication scopes, mutation flow, or offline behavior. There is no UX surface and therefore no role-emotional-intent change.

## Goals / Non-Goals

**Goals:**

- Remove every avoidable `multiple_permissive_policies` overlap on the 23-table inventory and document every intentional remainder.
- Preserve the exact effective `USING` and `WITH CHECK` result for public-only, authenticated, and other public-member role classes on `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- Make every table's disposition and equivalence proof reviewable in source control.
- Produce a post-push query that verifies applied topology and records any intentional remainder for MYK9-108.

**Non-Goals:**

- Change which callers or rows are authorized.
- Change table/column grants, FORCE RLS, role helpers, or application query paths.
- Optimize helper functions or add indexes; MYK9-114 owns separate hot-scan investigation.
- Apply the migration to the linked database without explicit approval.
- Add or duplicate any user-facing surface.

## Decisions

### 1. Treat the applied catalog as the source for current policy semantics

The implementation uses the 2026-07-28 `pg_policies` snapshot rather than inferring final state from hundreds of historical migrations. Policy expressions copied into the consolidation migration retain their catalog-emitted grouping.

Alternative considered: derive current state by replaying migration files. Rejected because historical policies are repeatedly replaced and the issue explicitly requires querying the target table state before writing a migration.

### 2. Use three explicit, reviewable transformation patterns

**Same-command OR consolidation**

- `enrollments`
- `exhibitor_profiles`
- `people`
- `role_requests`
- `vaccinations`

Policies with the same effective role/command become one policy whose predicate is the OR of the previous predicates. For `UPDATE`, both `USING` and `WITH CHECK` unions are preserved independently.

**Split management writes from broad reads**

- `judge_assignments`
- `notification_queue`
- `offline_scoring`
- `push_notification_queue`
- `sport_class_rules`
- `sport_templates`
- `sport_titles`
- `stripe_customers`
- `stripe_orders`
- `stripe_subscriptions`
- `sync_conflicts`
- `volunteer_class_assignments`
- `volunteer_general_assignments`
- `volunteer_roles`
- `volunteers`

An `ALL` management policy is replaced with command-specific `INSERT`, `UPDATE`, and `DELETE` policies. The existing `SELECT` predicate is retained or expanded with the management predicate when that union is not already implied. This removes the `SELECT` overlap without changing write authorization.

**Role-sensitive cases**

- `judge_availability`: replace two public `ALL` and two public `SELECT` policies with one public policy per command. `SELECT` uses admin OR owner OR secretary; writes use admin OR owner.
- `dogs`: retain `dogs_insert_secretary TO public` plus `dogs_insert TO authenticated` as intentionally layered. Merging would expose the authenticated-only co-owner/site-admin predicate to every public-member role; narrowing the public policy to `anon`/`authenticated` would revoke its existing behavior from hosted roles.
- `push_subscriptions`: retain the owner-only `TO public` policy plus the owner-or-platform-admin `TO authenticated` policy as intentionally layered for the same role-set reason.

Alternative considered: one generic dynamic migration that introspects and rewrites `pg_policies`. Rejected because explicit DDL is easier to audit, produces deterministic clean-install state, and prevents an unexpected live policy from being silently absorbed.

### 3. Prove logical equivalence and migration topology in one table-driven contract

The assertion-first TypeScript contract will contain a case for each affected table. It will:

- model the pre- and post-consolidation policies by public-only, authenticated, and other public-member role classes, command, and predicate atom;
- exhaustively evaluate every truth assignment of those atoms, including separate `USING` and `WITH CHECK` paths;
- assert identical visible/writable row sets before and after for every role class;
- inspect the migration SQL for the expected drops, roles, commands, and exact predicate fragments;
- reject table/column grant changes, helper rewrites, FORCE RLS changes, or unreviewed later policy DDL on the affected tables;
- expand the target policy topology and assert at most one permissive policy applies to each affected role/command except the five reviewed `dogs`/`push_subscriptions` groups.

This exhaustive Boolean proof is stronger than a few staging rows: it covers every possible result of the unchanged helper/subquery predicates. A post-push read-only catalog query remains required to prove the applied database matches the migration.

Alternative considered: staging-only fixture tests. Rejected as the primary contract because they require shared-system mutation and can sample only the users/rows present at the time. They remain useful as optional post-push smoke evidence.

### 4. Use small migrations grouped by policy shape and operational domain

The change will use timestamped migrations for:

1. same-command identity/registration consolidations;
2. show-day management/read splits;
3. catalog and volunteer management/read splits;
4. queue, payment, and sync management/read splits;
5. `judge_availability` consolidation plus the documented `dogs` and `push_subscriptions` exceptions.

Each migration starts with an inventory comment naming its tables and preserves unaffected policy names where practical.

### 5. Keep live application and advisor checks behind the database gate

Local tests, lint, typecheck, migration uniqueness, and `supabase db push --dry-run` may run before approval. A real push and post-push advisor/catalog verification require explicit confirmation and will be recorded in the change tasks and Linear issue.

Immediately before a real push, the applied policy inventory must be repeated and compared with the captured baseline. Any role, command, predicate, policy-name, or table-set drift pauses deployment until the migrations and proofs are re-reviewed.

## Risks / Trade-offs

- **A predicate is copied incorrectly** → Source contracts pin exact catalog-derived fragments and exhaustive truth tables; independent RLS review is required.
- **`ALL` implicit `WITH CHECK` behavior is lost when split** → New INSERT policies use explicit `WITH CHECK`; UPDATE policies use explicit `USING` and `WITH CHECK`.
- **Role coverage changes when replacing `public`** → Do not replace the public role set on `dogs` or `push_subscriptions`; record their five overlap groups as intentional remainders and test public-only, authenticated, and other public-member roles independently.
- **A concurrent migration changes policy state before deployment** → Re-run the catalog inventory and dry-run immediately before push; stop if the baseline differs.
- **Advisor findings remain** → Five known groups are intentional (`dogs` INSERT; four `push_subscriptions` commands). The post-push catalog query must report exactly those groups, and the disposition doc records why.
- **More policy objects are created when splitting `ALL`** → This is an intentional trade-off: fewer policies are evaluated per row/command, and command-specific policies make semantics explicit.

## Migration Plan

1. Land assertion-first tests and confirm they fail because the consolidation migrations do not exist.
2. Add the five grouped migrations and make the equivalence/topology contracts pass.
3. Run focused database contracts, migration uniqueness/sanity checks, typecheck, lint, OpenSpec validation, and a database push dry-run.
4. Obtain independent RLS/migration review and address all critical findings.
5. With explicit approval, push the migrations to the linked project.
6. Run the read-only `pg_policies` overlap query and Supabase advisor; record counts and any intentional remainder in MYK9-108's disposition document and MYK9-112.

Rollback before deployment is normal git rework. After deployment, rollback requires a forward migration that restores the captured 70-policy baseline; do not manually edit hosted policies.

The change will retain exact restoration SQL in its OpenSpec directory before deployment. If a migration batch fails, PostgreSQL rolls that migration back transactionally; earlier successful batches remain safe because every batch independently preserves authorization semantics. The operator must stop rather than retry blindly if the applied inventory is neither the complete baseline nor the complete target topology.

## Open Questions

- The exact post-push advisor count is intentionally not predicted from local topology alone because Supabase's advisor may report pairs differently from the catalog overlap query. Record both measurements after deployment.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This change rewrites RLS policy topology across 23 tables, including show-day, identity, and payment data; exhaustive equivalence contracts, broad database checks, dry-run evidence, and independent review are required.
