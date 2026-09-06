# MYK9-424

> **Status:** Active — implementation complete; PR review and delivery pending.

Status: implementation and review findings addressed; all six full shuffled runs passed; independent review awaiting transfer approval. Not merged or deployed. Request: “fix myk9-424”. Baseline: f47c47ed7.

Use the issue's existing finding contract rather than a new OpenSpec proposal for this bounded regression fix.

No duplicate UI: keep the existing staff Reports page and its authorization gate. Use the established replication-backed trial entry read for trial/show reports, as class reports already use their scoped read. Exhibitor show reads retain canonical release masking. No role, release-policy, database or deployment changes.

- [x] Assertion-first: reproduce cached qualified report loss and stalled show enrichment.
- [x] Fetch staff trial reports via getEntriesByTrial; aggregate existing trials for show scope. Propagate failed reads so printing is gated.
- [x] Bound the complete optional released-results enrichment operation; mask stale scores on all failures and expose completeness.
- [x] Verify actual read + report hook + rendered Results Sheet and High in Trial under endpoint error/throw/stall, and existing release/revocation behavior.
- [x] Run focused tests, typecheck/lint, diff review; record evidence and remaining shipping gates.

## Evidence — 2026-09-06

Baseline `f47c47ed7`; branch `codex/myk9-424`; worktree `/private/tmp/myk9-424`.

The isolated replay exercises the real `useReportData`, entry read functions, scoped report mapper, ResultsSheet, and HighInTrialReport. The IO fallback is seeded with sanitized rows representing an already-authorized secretary's warm replica: one dog qualified in Container and Interior, each at 38.5 seconds, placement 1, faults 0. The existing staff route authorization remains the prerequisite; this test does not claim a hosted login or real IndexedDB replay.

Network conditions: show refresh rejects offline; registration hydration is incomplete; results endpoint returns an error, throws, or never settles. Before the fix the error/throw replays printed `Qualified Entries: 0`, the stalled report never became ready, and the standalone show read did not settle. After the fix the report is ready/printable, the real markup has `Qualified Entries: 2`, placement `1`, and `00:38.50`; High in Trial names Ranger and totals `01:17.00`. Staff reports do not call the optional results view. The existing bounded show refresh is retained before trial reads.

Exhibitor coverage preserves canonical released values, withheld nulls, absent rows, and stale previously released scores after revocation. Thrown/resolved failures and deadline expiry mask cached scores and report `resultsReadComplete: false`. The entire enrichment batch sequence shares a 3-second budget, aborts the request on expiry, preserves batches that completed before expiry, and clears its timer. The separate preexisting show-refresh budget is also 3 seconds.

Checks:

- Assertion-first replay: 4 expected failures before implementation, all 4 pass afterwards.
- `pnpm exec vitest run src/services/database/entries src/hooks/queries/__tests__/useReportData --sequence.shuffle`: 20 files, 185 tests pass.
- `pnpm exec vitest run src/pages/secretary/ReportsPage/__tests__ src/components/reports/__tests__ --sequence.shuffle`: 29 files, 296 tests pass.
- App `tsconfig.app.json` and test `tsconfig.test.json` TypeScript checks pass.
- Targeted ESLint and `git diff --check` pass.
- `qa:dist-fresh` passes. Code-quality ratchet passes via `node --import tsx scripts/qa/code-quality-ratchet.ts`; the pnpm/tsx CLI invocation could not open its sandboxed IPC socket.

All issue acceptance criteria have local rendered evidence. Remaining delivery work: commit/PR, independent pre-merge review, CI, merge and deployment. No shared fixtures, RBAC policy, database rows, or deployments were changed. Linear remains In Progress until delivery. Hosted browser checks were not performed; the issue explicitly permits an isolated rendered replay. Full-suite repeated shuffle was subsequently completed during shipping (below).

## Review follow-up — 2026-09-06

Addressed five confirmed review findings in commit `c5448f59f`: released-result enrichment now preserves batches completed before its deadline and recognizes a complete empty no-access projection; all-trial staff reports use one show-scoped replicated scan; the entries query key includes the current synced trial IDs; and this plan now follows the `docs/` lifecycle with status metadata and an index row. Focused follow-up verification passes (28 tests, app/test TypeScript, and diff check). The completeness flag remains part of the exhibitor show-read contract; staff reports intentionally bypass optional enrichment and therefore do not need to gate on that flag.

## Shipping verification

The branch includes docs-only main update `ae05bbb60`. Full monorepo typecheck passes (including the existing E2E diagnostic baseline); full lint passes with 18 existing warnings and no errors. First full shuffled suite: 2,000 passed files, 19,133 passed tests, 9 skipped tests. All six full shuffled runs passed: each run had 2,000 passed test files and 19,133 passed tests (9 skipped tests). Native file-watcher tests and the tsx E2E typecheck need execution outside the desktop sandbox; both pass there.

Independent review blocker: automatic approval review rejected the Claude invocation because it transfers private repository code and issue context to the external Claude service. Specific transfer approval was requested and remains pending; no independent-review verdict is claimed. Open the PR as a draft and do not merge.
