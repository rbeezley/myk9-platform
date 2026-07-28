## 1. Applied-State Inventory

- [x] 1.1 Query the linked database read-only for the affected `pg_policies` role, command, `USING`, and `WITH CHECK` definitions.
- [x] 1.2 Reconcile the inventory to exactly 23 tables and classify every table by consolidation pattern.
- [x] 1.3 Search application code, tests, functions, advisor evidence, and later migrations for dependencies on the affected policy names or topology.
- [x] 1.4 Add the reviewed 23-table disposition and pre-push catalog query to the MYK9-108 advisor document.

## 2. Assertion-First Equivalence Contracts

- [x] 2.1 Add the table-driven pre/post policy model for all 23 tables.
- [x] 2.2 Add exhaustive `USING` and `WITH CHECK` truth-table assertions for public-only, authenticated, and other public-member role classes.
- [x] 2.3 Add migration-source assertions for required drops, roles, commands, and predicate fragments.
- [x] 2.4 Add negative assertions rejecting grant, FORCE RLS, helper, and unreviewed later-policy changes.
- [x] 2.5 Add target-topology assertions proving only the five documented `dogs`/`push_subscriptions` groups remain layered.
- [x] 2.6 Run the focused contract red before adding consolidation migrations.

## 3. Policy Consolidation Migrations

- [x] 3.1 Consolidate same-command policies for `enrollments`, `exhibitor_profiles`, `people`, `role_requests`, and `vaccinations`.
- [x] 3.2 Split show-day `ALL` management policies from broad reads for `judge_assignments` and `offline_scoring`.
- [x] 3.3 Split catalog and volunteer `ALL` management policies from broad reads for the seven affected tables.
- [x] 3.4 Split queue, payment, and sync `ALL` management policies from reads for the six affected tables.
- [x] 3.5 Consolidate `judge_availability` and document the intentionally layered `dogs` and `push_subscriptions` policies.
- [x] 3.6 Add exact forward-restoration SQL for the captured 70-policy baseline to the OpenSpec change directory.
- [x] 3.7 Run the focused contract green and review every migration against the applied catalog snapshot.

## 4. Verification

- [x] 4.1 Run focused database contracts plus migration uniqueness and database sanity contracts.
- [x] 4.2 Run the complete myK9Show database-contract test set.
- [x] 4.3 Run repository typecheck and lint.
- [x] 4.4 Run strict OpenSpec validation for `consolidate-permissive-rls-policies`.
- [x] 4.5 Run `supabase db push --dry-run` and confirm only the reviewed migrations are pending.
- [ ] 4.6 Re-run the applied policy inventory immediately before deployment and stop on any baseline drift.
- [x] 4.7 Complete independent RLS/migration review and resolve all critical findings.

## 5. Delivery and Applied Evidence

- [x] 5.1 Commit the verified implementation and open a PR linked to MYK9-112 and this OpenSpec change.
- [x] 5.2 Record local checks, risk, intentional non-goals, and the pending database gate in the PR and Linear issue.
- [ ] 5.3 After CI and review pass, merge the PR.
- [ ] 5.4 With explicit approval, push the migrations to the linked Supabase project.
- [ ] 5.5 Re-run the catalog overlap query and Supabase advisor, update the MYK9-108 disposition with observed counts, and confirm MYK9-112 acceptance criteria.
- [ ] 5.6 Mark MYK9-112 Done only after the applied-state evidence gate passes, then archive the OpenSpec change and clean up the branch/worktree.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: RLS migrations across identity, payment, and show-day tables require exhaustive semantic proof, broad database contracts, full static checks, an applied-state dry run, and independent security review.
