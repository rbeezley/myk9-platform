## PR A — Database Expand

- [ ] A.1 Record the staged expand/adopt/contract design and the explicit legacy-column exposure window.
- [ ] A.2 Add assertion-first behavioral SQL covering subject, site admin, manager-denied reads, ordinary exhibitor, anon/PUBLIC grants, deleted targets/entries, RPC validation/redaction, lossless compatibility behavior, and adversarial manager `handler_id` reassignment.
- [ ] A.3 Register the new SQL test in the explicit runner list and its exhaustive harness test.
- [ ] A.4 Add a migration creating `people_private`, fixed-search-path read/write helpers, narrow read/update RPCs, explicit ACLs, lossless backfill, and one-way legacy sync. Keep all client RPC calls out of this PR.
- [ ] A.5 Run migration guard, harness registration test, SQL/static checks, OpenSpec validation, code-quality ratchet as required, then review against the full security checklist.

## PR A deploy gate

- [ ] A.6 Merge PR A after required CI and security review; do not mark MYK9-664 complete.
- [ ] A.7 Obtain explicit approval for linked database push, apply the migration from a merged/linked worktree, and verify ACLs, role scenarios, and PostgREST RPC exposure.

## PR B — Client Adopt

- [ ] B.1 Regenerate database types from the applied schema.
- [ ] B.2 Move only self/site-admin profile and site-admin user-management surfaces to private RPCs. Account shell, presence, people search, and general directory remain public-only; manager paperwork private reads stay disabled pending trusted consent/provenance.
- [ ] B.3 Run focused tests, typecheck, shuffled app tests, and production deployment verification.

## PR C — Database Contract

- [ ] C.1 Confirm PR A applied and verified, PR B merged with a green production Vercel deployment at/after its merge SHA, and source contract checks find no application references to legacy columns.
- [ ] C.2 Record Richard's explicit acceptance that older cached web clients may require refresh/retirement.
- [ ] C.3 Replace `update_person_with_private` with a contract-phase definition that no longer references or updates legacy columns; assert `pg_get_functiondef` for the deployed signature contains neither legacy field name before dropping them.
- [ ] C.4 Remove legacy columns and compatibility trigger; revoke authenticated column SELECT; test `has_column_privilege(..., 'date_of_birth', 'SELECT')` and same for `junior_handler_numbers` are false.
- [ ] C.5 Apply only after merge/explicit approval, verify the applied ACLs and workflows, then close MYK9-664.

## Deferred acceptance prerequisite

- [ ] D.1 Obtain a product/security decision on trusted subject consent or immutable entry-assignment provenance for manager paperwork reads; editable `entries.handler_id` is explicitly not authorization evidence.
- [ ] D.2 Implement and adversarially test the accepted manager-read mechanism, or revise the access spec/issue acceptance criteria with an explicit product decision. Do not close MYK9-664 while its manager-paperwork requirement is unimplemented.
