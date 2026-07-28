## 1. Baseline and Source Attribution

- [x] 1.1 Record the database/statistics reset timestamps, live row counts,
      existing indexes, top related `pg_stat_statements`, and a 10-second current
      scan sample in `design.md`.
- [x] 1.2 Reproduce a full-row account/ringside view plan and record the
      per-read `user_roles`, `judge_assignments`, and `show_passcodes` scan deltas.
- [x] 1.3 Name and disposition the secondary 60-second RBAC polling and
      PostgREST `judge_assignments` embed sources without duplicating MYK9-109,
      MYK9-112, or MYK9-113.

## 2. Assertion-First Database Contracts

- [x] 2.1 Add a failing migration contract test requiring one internal
      `STABLE SECURITY DEFINER` caller-context helper with an empty search path and
      no exposed-schema or direct API-role access.
- [x] 2.2 Add a failing contract test requiring the latest
      `view_authenticated_entry_results` definition to use one materialized
      caller-context row rather than direct per-field reads of `user_roles`,
      `judge_assignments`, or `show_passcodes`.
- [x] 2.3 [EXPANDED] Add
      `supabase/tests/myk9_114_entry_access_context_test.sql` using the existing
      transaction-rolled-back fixture/JWT pattern; run it against the current local
      database before implementation to pin active/expiration, manager-club,
      assigned-judge, steward, current-passcode, revoked-passcode, row-admission,
      and protected-field behavior.
- [x] 2.4 Pin the existing view column list, security-definer property,
      grants/revokes, and `GREATEST(...) AS updated_at` replication watermark.
- [x] 2.5 [EXPANDED] Keep the same fixture-backed SQL role matrix unchanged
      after implementation and rerun it for site admin, scoped manager, assigned
      judge, steward, exhibitor, expired role, anonymous ringside caller without a
      person row, and stale passcode. The behavior matrix is a green-before/green-
      after characterization test; the source-shape contracts in 2.1–2.2 provide
      the required red-before/green-after signal.

## 3. Statement-Scoped Access Implementation

- [x] 3.1 [CORRECTED] Add one atomic forward migration based on the latest
      view-defining migration, creating a non-exposed `private` schema and its
      caller-context helper, aggregating active role scopes, assigned classes,
      steward scopes, and ringside claim state once; normalize absent rows to
      fail-closed empty context values.
- [x] 3.2 Recreate `view_authenticated_entry_results` with only the one-row
      caller context materialized, retaining entry-filter pushdown and every
      caller-visible authorization/result-release rule.
- [x] 3.3 [CORRECTED] Reapply the exact authenticated/service-role view grants;
      grant those roles function `EXECUTE` only, while revoking `private` schema
      access from PUBLIC/anon/authenticated/service_role so the helper cannot be
      called directly or exposed through PostgREST.
- [x] 3.4 Add a repository diagnostic SQL script that captures reset timestamps,
      relation counters, representative plans, and deterministic account/ringside
      per-read scan deltas. Keep
      `scripts/qa/db-drift/myk9-114-scan-evidence.sql` incapable of resetting
      statistics, and use `myk9-114-scan-evidence.ts` to orchestrate mutually
      exclusive snapshot/read/snapshot sessions.
- [x] 3.5 [CORRECTED] Prove the public API metadata surface is identical before
      and after the private-schema migration; `packages/supabase/src/types/database.types.ts`
      requires no change and the helper does not enter PostgREST function metadata.

## 4. Focused Verification

- [x] 4.1 Run the new source contract test red before implementation and green
      afterward with
      `pnpm --dir apps/myk9show exec vitest run src/test/database/myk9114EntryAccessContext.source.test.ts`.
- [x] 4.2 [EXPANDED] In isolated pre/post databases, run the SQL behavior
      matrix with
      `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_114_entry_access_context_test.sql`,
      then run the named existing authenticated-entry-results, ringside-passcode
      generation/revocation, ringside-claim authz, exhibitor/co-owner queue, result
      visibility, and replicated-entry Vitest files.
- [ ] 4.3 [EXPANDED] Run `supabase db lint --local --level warning`,
      `pnpm --filter @myk9/supabase typecheck`,
      `pnpm --filter @myk9/show typecheck`, and
      `pnpm openspec validate 'myk9-114-scan-source-remediation' --type change --strict --no-interactive`.
- [x] 4.4 Compare pre/post plans locally or in an isolated database for global,
      show-scoped, class-scoped, and watermark reads; verify that only the caller
      context is materialized and that each hot relation has at most two scans per
      representative full-row read.
- [x] 4.5 Run the required database/security second-opinion review, fix critical
      findings, and document any accepted warnings.
- [x] 4.6 [EXPANDED] Add a source contract requiring helper creation, view
      replacement, privilege changes, comments, and schema notification to sit
      inside one explicit transaction. In an isolated local database, apply a
      temporary migration copy with an injected exception immediately before
      `COMMIT`; reconnect and assert the prior view-definition hash and grants are
      unchanged and the new helper is absent. Do not add the temporary copy to the
      migration directory.

## 5. Tracking, PR, and Shared-System Evidence Gate

- [x] 5.1 Update `docs/launch/go-live-2026-07-26.md` with the three concrete
      sources, secondary-source deferrals, and the MYK9-109 handoff.
- [x] 5.2 Commit the reviewed implementation, request approval for the external
      GitHub write, push the feature branch, and open a PR using the repository
      template with `Tracked in openspec change:
myk9-114-scan-source-remediation`.
- [ ] 5.3 Record focused checks, review result, branch/PR, risks, and acceptance
      status on MYK9-114; keep the issue In Progress until its evidence gate passes.
- [x] 5.4 After explicit database-write approval, capture the final pre-reset
      evidence, push the migration, and smoke-test representative site-admin,
      secretary, judge, steward, exhibitor, valid-claim, and stale-claim reads.
      Migration `20260728210000` was linked-deployed on 2026-07-28; all paths
      passed using existing rows (the database had no active persistent steward
      fixture, so the current steward passcode path supplied that smoke).
- [ ] 5.5 After explicit statistics-reset approval, run `pg_stat_reset()`, replay
      the agreed representative/MYK9-109 workload, and attach attributable
      post-reset scan counts and ratios to MYK9-114. [BLOCKED] Supabase denies
      both database-wide and per-table resets to the linked non-superuser
      `postgres` role. Reset-incapable separate-session evidence passed instead:
      account `1/1/0` and valid ringside `1/1/1` total scans for
      `user_roles`/`judge_assignments`/`show_passcodes`.
- [ ] 5.6 After CI, review, merge, and the post-reset evidence gate pass, mark
      MYK9-114 Done with the PR and merge commit, archive the OpenSpec change, sync
      tracking, and perform final branch/worktree cleanup.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes a security-definer database view used by offline
  show-day replication and must preserve authorization across every role while
  proving a measurable query-plan improvement.
