# Verification Evidence

## Assertion-first proof

- Red run: the 27 inventory, truth-table, and topology assertions passed; 22 source assertions failed because the five reviewed migration files did not yet exist.
- Green run: `permissivePolicyConsolidationRlsContract.test.ts` passes all 52 assertions.
- The contract exhaustively evaluates every predicate-atom assignment for public-only, authenticated, and other public-member role classes across `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, including separate UPDATE `USING` and `WITH CHECK` paths.

## Repository checks

- Focused migration/database contracts: 4 files, 84 tests passed.
- Complete `apps/myk9show/src/test/database` set: 67 files, 475 tests passed.
- Repository typecheck: passed.
- Repository lint: passed.
- Strict OpenSpec validation: passed.
- `git diff --check`: passed.

## Database preparation

- Read-only applied inventory: 70 policies across the 23 affected tables.
- Migration collision check against current `origin/main`: no collision.
- `supabase db push --dry-run`: exactly the five MYK9-112 migrations are pending; nothing was applied.
- Exact forward-restoration artifact: `rollback.sql` recreates the captured 70-policy baseline.
- Exact-SQL signatures bind all 58 forward and 70 rollback policy definitions to their reviewed roles, commands, `USING`, and `WITH CHECK` text.

## Independent migration audit

Combined verdict: **PUSH WITH CAUTION; no blocking defects**.

- Roles, commands, logical unions, and implicit `WITH CHECK` behavior are preserved.
- All drops use `IF EXISTS`; no tables, data, constraints, functions, table privileges, or RLS mode change.
- Two inherited row-correlated helper patterns remain in the `people` and volunteer policies. They predate MYK9-112 and are retained to avoid changing authorization semantics.
- Expected advisor remainder: five intentional role-mismatched groups (`dogs` INSERT and four `push_subscriptions` commands).
- The required external Codex second-opinion review remains a pre-merge gate because submitting the private branch diff requires separate authorization. The repository-required migration-auditor and PR branch reviews are complete.

## Pending shared-system gate

- Immediately before deployment, repeat the applied policy inventory and stop on drift.
- A real Supabase push and post-push advisor/catalog verification require explicit approval.
