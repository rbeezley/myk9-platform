## 1. Baseline inventory and disposition

- [x] 1.1 Read MYK9-113, MYK9-109, the launch-readiness source, current migrations, and the
      linked database before choosing index changes.
- [x] 1.2 Run one read-only linked-database inventory covering public foreign keys, complete
      index definitions, exact duplicate signatures, scan counts, table activity, and sizes; audit
      strict leading-key/non-partial coverage separately from the advisor-compatible subset query.
- [x] 1.3 Create the timestamped MYK9-113 evidence ledger with all 78 strictly uncovered foreign
      keys (and the advisor-compatible count of 52),
      both duplicate groups, and a one-line disposition for every one of the 147 baseline zero-scan
      indexes.

## 2. Assertion-first migration contracts

- [x] 2.1 Add a focused Vitest source-contract test that enumerates the 78 expected foreign-key
      table/column pairs and fails until each has an explicit additive index.
- [x] 2.2 Assert additions and drops are in separate ordered migrations, exactly the two reviewed
      duplicates are dropped, and both retained twins are protected.
- [x] 2.3 Run the focused test red and record the expected missing-migration failure before
      implementation.

## 3. Index migrations

- [x] 3.1 Add the additive migration with stable, non-truncating names for all 78 covering btree
      indexes and catalog postconditions proving every public foreign key is covered.
- [x] 3.2 Make the focused source-contract test green against the additive migration.
- [x] 3.3 Add the later subtractive migration dropping only
      `platform_waitlist_email_unique` and `push_subscriptions_user_id_idx`, with postconditions
      proving each canonical twin remains.
- [x] 3.4 Make the duplicate-index source-contract assertions green.

## 4. Local and dry-run verification

- [x] 4.1 Run the focused index-hygiene contract, migration version uniqueness, and database
      migration sanity tests.
- [x] 4.2 [EXPANDED] Restore a read-only remote schema snapshot into a disposable vanilla
      PostgreSQL cluster, apply both migrations there, and rerun the strict catalog invariants;
      do not use Supabase local/Docker. Stop and record the blocked gate if the scratch cluster is
      unavailable.
- [x] 4.3 Run strict OpenSpec validation, `git diff --check`, and the relevant repository
      lint/type checks required by changed TypeScript test code.
- [x] 4.4 Link the worktree to project `sojmvhhwsjxmfistvzbe` if needed and run
      `supabase db push --dry-run`; record the exact pending migrations without applying them.
      Passed 2026-07-28: the dry run reported only `20260728140000_add_foreign_key_indexes.sql`
      and `20260728141000_drop_duplicate_indexes.sql`. No migration was applied.
- [x] 4.5 Complete OpenSpec implementation verification and resolve every critical/high finding.

## 5. Shared Supabase evidence gate

- [ ] 5.1 Obtain explicit user approval for the real linked-project `supabase db push`.
- [ ] 5.2 Recheck affected relation sizes, apply the migrations in a quiet window, and record the
      migration result.
- [ ] 5.3 Rerun the catalog inventory and Supabase performance advisor; add post-push uncovered-FK,
      duplicate-group, zero-scan, and advisor counts to the evidence ledger.

## 6. Tracking and shipping

- [ ] 6.1 Update the existing launch-readiness tracking source with the verified MYK9-113 result
      and any dependency remaining on MYK9-109.
- [ ] 6.2 Commit the bounded diff, run required migration/database second-opinion review, push the
      feature branch, and open a PR linked to MYK9-113 and this OpenSpec change.
- [ ] 6.3 Wait for required CI and review, fix actionable failures, and merge only with explicit
      user approval.
- [ ] 6.4 After merge, update MYK9-113 with implementation and verification evidence, move it to
      Done only if every acceptance criterion passed, archive the OpenSpec change, sync `main`, and
      clean up the branch/worktree.

## Validation Profile [ADDED]

- Risk: high
- Validation: full
- Rationale: The change adds and drops shared-database indexes, so it requires assertion-first
  source contracts, disposable PostgreSQL execution from a read-only remote schema snapshot,
  linked-project dry-run evidence, post-push catalog/advisor checks, second-opinion review, CI,
  and an explicit shared-system approval gate.
