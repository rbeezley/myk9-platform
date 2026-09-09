# MYK9-452: restore exhibitor self-check-in

> **Status:** Active — implemented locally; shipping and applied replay pending.

Request: “review and implement myk9-452”

Tracking: [MYK9-452](https://linear.app/myk9-platform/issue/MYK9-452)

## Scope and review

The installed `20260908134900` function illegally references its UPDATE target
inside FROM JOIN predicates. PL/pgSQL accepts the definition but fails at runtime.
Use the lightweight maintenance workflow instead of OPSX for this single-function
regression. No new UI, client settings behavior, staff writer, or RLS policy changes.

## Implementation and testing

- [x] Add behavioral SQL calling the installed RPC as authenticated owner, co-owner,
      handler, outsider, unlinked caller, and anon. Read persisted rows after every
      call; denied calls and unrelated entries must remain unchanged.
- [x] Prove the valid-owner test fails on the current function before writing the fix.
- [x] Add a forward migration using a legally correlated visibility subquery,
      preserving status validation, ownership and class > trial > show > true.
- [x] Exercise all allowed statuses, NULL/unsupported status rejection, absent
      settings, and enabled/disabled/inherited settings at every level.
- [x] Register SQL coverage in both behavioral test-runner lists; run the runner
      contract and focused client tests, and code-quality ratchet.
- [x] Review the final diff against every acceptance criterion and record evidence.

## Closure gates

Local synthetic PostgreSQL replay proves function behavior; the complete migrated
Supabase behavioral suite runs in CI. PR creation/merge, application of the forward
migration, and an owned exhibitor replay against the applied database remain
separate shipping/authorization steps. Keep the issue In Progress until those gates
and persisted status read-back are complete.

## Verification evidence (2026-09-09)

Branch: `codex/myk9-452`; base: `679b04e84`. No application source changed.

- Reviewed the full issue, current RPC, client writer boundary, visibility schema,
  and replication-version trigger. The forward fix uses correlated EXISTS so the
  existing outer-entry references are legal, keeping every authorization predicate.
- In-flight exact migration/test paths passed. The broader directory/runner check
  flagged old branches with unrelated migrations and existing list registrations;
  no open PR or In Progress issue overlapped this regression. Add only the new
  test to the current main runner lists; preserve all existing registrations.
- Read-only linked database and origin/main both ended at `20260908134900`.
  Chosen new version: `20260909174329`.
- PostgreSQL 18, isolated Unix socket, synthetic tables: current migration fails
  the first valid-owner assertion with SQLSTATE 42P01 (psql exit 3). After the
  forward migration, all **69** RPC cases pass (exit 0), including the actual
  replication-version trigger from `20260608200000`.
- SQL cases cover distinct owner/co-owner/handler, outsider, anonymous/unlinked/
  missing-identity callers, NULL/unsupported statuses, nonexistent entry, every
  allowed status, absent settings and 18 visibility combinations for all three
  authorized roles. Full persisted entry snapshots prove denials do not write,
  success changes only the requested row, and version increases exactly once.
- Client tests: **33 passed** across selfCheckInRlsContract, selfCheckinBatch,
  useSelfCheckinEnabled and SelfCheckinTool.
- SQL-runner contract: **8 passed**, shuffled. Shell syntax and diff whitespace
  checks passed. Code-quality ratchet passed (initial sandbox IPC restriction was
  resolved by rerunning with elevated local execution).
- Logs and disposable schema: worktree `.logs/sql-red.log`,
  `.logs/sql-green-version.log`, `.logs/client-tests.log`,
  `.logs/client-settings-tests.log`, `.logs/sql-runner-tests.log`.

## Remaining shipping evidence

- [ ] Commit/push validation ladder and migration provenance guard against the
      committed candidate and refreshed main/database. Authorized by `/ship-pr`.
- [ ] Full migrated Supabase behavioral CI run (the local synthetic replay does
      not include the complete RLS/trigger stack).
- [ ] Independent cross-harness pre-merge review and PR/merge.
- [ ] Separately authorized application from merged code, then owned exhibitor
      RPC/browser replay and persisted status read-back. Never close based solely
      on source tests, migration ledger, or merge.

## Shipping validation

- `pnpm typecheck` and `pnpm lint`: exit 0 using valid Turbo cache entries;
  existing test-type baseline and lint warnings remain unchanged.
- Database contracts shuffled: 106 files / 762 tests passed, exit 0.
- Full app suite shuffled with verbose reporting and four workers: 2,032 files /
  19,468 tests passed; 1 file / 9 tests skipped; exit 0. See `.logs/ship-shuffle-final.log` for the recorded seed.
- Initial quiet run was stopped per the no-progress rule. The sandboxed verbose
  run exposed blocked native file-watch events and loopback HTTP binding; the
  complete unrestricted run above passed without code changes.
- Shipping in-flight check flags only six old local branches touching the shared
  SQL runner lists. Their changes are historical registrations, not this RPC;
  inspected their diffs and retained current-main lists plus this one new entry.
  No competing PR or In Progress issue implements MYK9-452.
