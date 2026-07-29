## 1. Baseline and staleness inventory

- [x] 1.1 Inventory every existing Playwright, framework, runner, database, k6, Artillery, package
      script, seed, and workflow entry point; record whether it executes and which routes,
      selectors, credentials, endpoints, metrics, or grading rules are stale.
- [x] 1.2 Confirm the canonical current routes and mutation/query paths for ringside scoring,
      secretary check-in, exhibitor reads, and run-order/dogs-ahead before changing scenarios.
- [x] 1.3 Resolve the approved non-production gate target and compute tier. (Owner approved sole
      remote prelaunch project `sojmvhhwsjxmfistvzbe`; Micro; cap 60; 2026-07-28.)

## 2. Assertion-first contracts

- [x] 2.1 Add a focused failing contract proving the load Playwright config discovers a non-zero
      suite containing the Normal show-day gate test.
- [x] 2.2 Add failing unit contracts for exact Normal session composition, role-bound current
      workflows, target preflight, scenario-specific grading, missing-metric failure, and
      informational Peak/Stress labeling.
- [x] 2.3 Add a failing source/isolated-schema contract for the canonical seed's approximate
      500-entry count, deterministic cleanup/rerun, and multi-trial/class spread.
- [x] 2.4 Run the focused contracts red and record the expected failures before implementation.

## 3. Executable load entry points

- [x] 3.1 Add `playwright.load.config.ts` with the load directory/match, Chromium, zero retries,
      one outer worker, bounded timeouts, and explicit environment wiring.
- [x] 3.2 Point `test:load:playwright`, `test:load:quick`, `test:load:full`, and a new
      `test:load:list` command at the load config; make orchestration propagate every child exit.
- [x] 3.3 Make the discovery contract green with a visible non-zero test count.

## 4. Show-day scenario and truthful evaluation

- [x] 4.1 Replace the mutable browse-heavy Normal definition with an immutable 100-session,
      role-bound show-day definition containing at least 50 ringside scoring sessions plus
      check-in, exhibitor, run-order/dogs-ahead, and operational reads.
- [x] 4.2 Refactor the existing runner to use canonical seeded accounts/IDs, current consolidated
      routes/selectors, isolated browser contexts, and the established replication-backed
      scoring/check-in paths; remove or retire fake `/api/*` flows.
- [x] 4.3 [EXPANDED] Add typed request, conflict, replication-queue, and platform metric collection
      plus a machine-readable result/evidence renderer; define `40001` over all scoring attempts,
      separate retry outcomes, sample peak connections, and calculate `pg_stat_statements`
      baseline-to-final deltas.
- [x] 4.4 Implement a pure evaluator that uses each scenario's own latency, error, throughput,
      availability, concurrency, and ringside-session budgets and fails on missing G9 metrics.
- [x] 4.5 Refresh or explicitly retire the database, k6, Artillery, and full-runner paths so every
      documented command is honest about what it covers.
- [x] 4.6 Make the scenario, safety, metrics, and evaluator contracts green.
- [x] 4.7 [ADDED] Keep every new/rewritten implementation module under 500 lines and TypeScript;
      document, retire, or replace legacy JavaScript-only k6/Artillery assets without extending
      them with new JavaScript.

## 5. Canonical realistic fixture

- [x] 5.1 [EXPANDED] Extend `supabase/seed-demo.sql` with a deterministic, set-based range of 63
      dogs × 8 non-finalized classes = 504 active load entries across four existing trials,
      producing 514 total demo-show entry rows while preserving the ten hand-authored rows and the
      finalized/released class.
- [x] 5.2 Extend cleanup/preflight/postconditions so two consecutive canonical reseeds produce the
      same IDs/counts without foreign-key, uniqueness, or permission failures.
- [x] 5.3 Make the focused seed contract green and execute the final-schema approved remote
      reset/reseed lifecycle twice. (Both runs: 514 entries, 504 load rows, digest
      `c8826d00f43bd3d7d82d286f9911287e`.)

## 6. Safe recurring anti-rot validation

- [x] 6.1 Add a bounded approved-target load smoke that proves authentication, current show-day
      routes, replication-backed writes, and result generation behind the remote approval gate.
- [x] 6.2 Keep routine automation to compile/contracts/discovery with zero shared writes; keep the
      bounded remote smoke and full rehearsal manual and out of pull-request CI.
- [x] 6.3 Update the load README with pnpm commands, exact scenario budgets, environment safety,
      fixture lifecycle, evidence schema, and the manual full-rehearsal procedure.
- [x] 6.4 [ADDED] Add assertion-first contracts for four exact 25-session shards, global-sequence
      ramp preservation, future-start validation, missing/duplicate/late shard failure, exact raw
      percentile aggregation, and single-owner platform telemetry.
- [x] 6.5 [ADDED] Add a `workflow_dispatch`-only GitHub Actions rehearsal using four standard
      public-repository Ubuntu runners, local frontend serving, existing remote Supabase, artifact
      aggregation, and an unconditional canonical reseed/postcondition cleanup job.
- [x] 6.6 [ADDED] Document the two missing GitHub secret names and keep the workflow fail-closed
      until `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_PASSWORD` are explicitly installed; do not
      use Vercel or paid/larger runners.

## 6A. Incident remediation — enforced isolation and conflict containment

- [x] 6A.1 [ADDED] Add assertion-first contracts for ordinary-test Supabase network isolation,
      bounded OCC retries, and database breaker behavior.
- [x] 6A.2 [ADDED] Install an ordinary Vitest HTTP guard that rejects hosted Supabase requests
      without affecting dedicated remote E2E/load processes.
- [x] 6A.3 [ADDED] Cap automatic OCC conflict retries in the replication mutation manager and
      preserve the existing terminal failure path; modify the canonical offline-scoring durability
      requirement from 50 persisted attempts to eight.
- [x] 6A.4 [ADDED] Add a migration that monitors conflict volume, records durable breaker state,
      and revokes authenticated ringside execution when the threshold is exceeded.
- [x] 6A.5 [ADDED] Run focused tests plus OpenSpec validation and record incident verification.
      (103 focused tests, replication/app TypeScript checks, strict OpenSpec validation, and
      migration dry run passed; broad app shards hit the known >60-second hang and were stopped.)
- [x] 6A.6 [ADDED] Keep migration deployment and authenticated grant restoration approval-gated
      until the stale caller is confirmed absent. (Dry run only; remote RPC remains revoked.)

## 7. Local and implementation verification

- [x] 7.1 Run focused load/seed/target tests, Playwright load discovery, the bounded remote smoke,
      and relevant myK9Show TypeScript checks; stop any runner that hangs for more than 60 seconds
      without useful output.
- [x] 7.2 Run `pnpm openspec validate --change repair-load-rehearsal-harness`, `git diff --check`,
      and OpenSpec implementation verification; resolve all critical findings.
- [x] 7.3 [EXPANDED] Review the diff and generated evidence for unrelated changes, leaked tokens,
      credentials, storage state, database URLs/headers, production/shared-target risk, and
      threshold weakening.

## 8. Approved rehearsal and G9 evidence

- [x] 8.1 Obtain explicit operator confirmation for the named non-production project, fixture
      reseed/load window, and any required telemetry access before shared-system writes or load.
- [ ] 8.2 [EXPANDED] Preflight MYK9-111 deployment, target identity, 514-row demo fixture,
      sanitized telemetry sources, compute tier, and connection cap; capture pre-run
      `pg_stat_statements`/activity baselines and abort if any required proof is missing.
- [ ] 8.3 [EXPANDED] Run the full Normal rehearsal and record peak CPU/IO, peak connections vs cap,
      scoring-write p95, `40001` count/rate over scoring attempts, retry outcomes, maximum queue
      depth, bounded final drain/persisted-score reconciliation, throughput, availability,
      statement deltas, and the supported ringside-session/entry ceiling.
- [ ] 8.3a [ADDED] Require all four synchronized shard artifacts from the same workflow/start
      identity and aggregate raw samples/counters into the single G9 result; treat runner lateness,
      missing artifacts, or local saturation as incomplete rather than a Supabase failure.
- [ ] 8.4 Keep G9 open on any missing/failing dimension; otherwise update the Phase 4 runbook and
      launch-readiness scorecard with the passing evidence.
- [ ] 8.5 [ADDED] Preserve evidence and restore/reseed the approved remote target after success,
      failure, or interruption; verify the canonical fixture postconditions before leaving the
      window.

## 9. Tracking and shipping

- [x] 9.1 Complete OpenSpec implementation verification and the repository's required independent
      review for high-risk show-day/performance infrastructure.
- [ ] 9.2 Commit the bounded diff, push the feature branch, open a PR linked to MYK9-109 with
      `Tracked in openspec change: repair-load-rehearsal-harness`, and wait for required CI/review.
      This implementation PR must merge before GitHub can dispatch the new manual workflow.
- [ ] 9.3 Merge the implementation only with explicit approval so the workflow exists on `main`;
      keep MYK9-109 and G9 open. After tasks 8.2–8.5 pass, post the rehearsal evidence and move the
      issue to Done only when every acceptance criterion and evidence follow-up passed.
- [ ] 9.4 Archive the OpenSpec change only after all required PRs merge, then sync `main`, prune
      refs, delete the feature branch, and remove the worktree as the final cleanup command.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The change drives concurrent show-day writes, extends the canonical shared fixture,
  and may create material load on a Supabase project. It requires assertion-first contracts,
  isolated lifecycle execution, explicit target/load approval, cloud/database/client evidence,
  independent review, CI, and a passing rehearsal before G9 or MYK9-109 can close.
