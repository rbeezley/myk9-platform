# Tasks

## 1. Record why the old workload was wrong

- [x] 1.1 Amend `separate-g9-generator-saturation` to note that its "unchanged workload" constraint is superseded here, so the frozen counts are not re-preserved by a future change reading only that document. Done 2026-08-27 in all four of its documents — `specs/g9-rehearsal-safety/spec.md` (the binding one), `proposal.md`, `design.md`, `tasks.md` §9.3. Original text retained; supersession added alongside it. The notes also correct the now-disproven generator-contention attribution, which run 33038456110 refuted by failing 98 of 100 workflows with all sixteen shards HEALTHY.
- [ ] 1.2 Capture the evidence in this change: run 33075234998 measured a 9.4 s scoring-write p95 with valid attribution, traced to seven concurrent scorers per class serializing on the class row lock.

## 2. Multi-show fixture

- [ ] 2.1 Replace the single `LOAD_SHOW_ID` and eight-element `LOAD_CLASS_IDS` with a fixture describing four shows: one of eight rings, three of four rings.
- [ ] 2.2 Give each show its own classes and entries; assert in a contract test that no class or entry is shared across shows.
- [ ] 2.3 Extend the seed to create the additional shows, and extend restoration to return all four to canonical state.
- [ ] 2.4 Verify the restore path still proves exact row counts per show before any rehearsal is dispatched.

## 3. Session assignment

- [ ] 3.1 Map each session to a show and a class; scoring sessions take a distinct class each.
- [ ] 3.2 Fail scenario construction when scoring sessions exceed available rings, naming the over-subscribed class. Do not distribute by modulo.
- [ ] 3.3 Preserve exact global sequence assignment across sixteen shards for the new topology, as `g9-rehearsal-safety` requires.
- [ ] 3.4 Add a mutation check proving the distinct-class guard is non-vacuous: reintroducing modulo distribution must fail a test.
- [ ] 3.5 Provision a separate staff identity per show. The runner currently clones one secretary auth state across every secretary session; if that account can manage all four fixture shows, `manageable_show_ids()` returns all four and every session sees every show's entries, collapsing the own-show versus cross-show comparison the fixture exists to make.
- [ ] 3.6 Assert before the load starts that each staff credential's `manageable_show_ids()` resolves to exactly its assigned show. Fail closed rather than inferring scoping from the fixture.
- [ ] 3.7 Provision exhibitor identities owning or handling entries in their assigned show, for the check-in workload.

## 4. Workload mix and parameters

- [ ] 4.1 Express every session count as a parameter with provenance — operator-observed or estimated, and for estimates what would replace them.
- [ ] 4.2 Set counts per `design.md`: 20 scoring, 44 check-in, 264 readers, 10 ops across four shows.
- [ ] 4.2a Derive `ringsideSessionsMin` from the fixture's ring count instead of the fixed `50`. `validateScenarioDefinition` (`loadScenario.ts:188`) and `evaluateLoadResult` both compare the scenario's ringside count against it, so 20 scoring sessions against a floor of 50 fails every reshaped run twice over — at construction and at evaluation. With one scorer per ring the assertion is equality with ring count, not a floor.
- [ ] 4.2b Rebuild `peak` and `stress` to scale by shows and rings rather than by scorers per class. They currently declare 125 and 250 ringside sessions (`ringsideSessionsMin` 125 and 250) derived from `G9_NORMAL_SCENARIO`, which under the one-scorer-per-class invariant makes both unconstructable. Scale their fixtures and minimums together.
- [ ] 4.3 Give check-in a bursty arrival pattern anchored to class start rather than uniform arrival.
- [ ] 4.3a Route check-in through the **exhibitor self-check-in** path — exhibitor credentials, owned or handled entries, self-check-in mutation. Reusing `secretary-check-in` with staff auth would satisfy the arrival-pattern constraint while exercising different authorization and a different mutation, then be reported as exhibitor coverage. Assert the acting role in a contract test.
- [ ] 4.4 Assert the reader-to-writer ratio in a contract test, so a future edit that inverts the mix fails rather than passing quietly.

## 5. Hybrid generation

- [ ] 5.1 Build an API-level virtual-user generator that reuses the replication layer's own query construction rather than hand-written endpoint calls.
- [ ] 5.2 Add a contract test asserting the virtual user's endpoint mix and sync cadence match a real reader session's; fail on divergence.
- [ ] 5.3 Keep every writer session and one reader per runner on a real browser.
- [ ] 5.4 Report browser-generated versus API-generated counts per workload kind in the aggregate evidence.
- [ ] 5.5 Confirm the browser context count per runner has not increased over the current six to seven.

## 6. Cross-show observability

- [ ] 6.1 Attribute `classes` replication delta volume to the originating show, so cross-show pull is visible in evidence. Classes churn cross-show because the writer workloads advance `classes.updated_at` through `refresh_class_scoring_state`.
- [ ] 6.2 Record scoped versus unscoped sync counts **and per-poll cost** for both `dogs` and `classes`. Do not require cross-show dog _delta volume_: no declared workload mutates `dogs`, so after watermarks establish there are no dog deltas to return and the metric would be vacuous. The real dog cost is the unscoped poll itself — 79.7 ms mean in run 33075234998 with no owner filter.
- [ ] 6.3 If a later revision wants dog delta volume as evidence, add a workload that actually mutates dogs first. Adding the metric without the writes reports an empty result as a finding.

## 7. Testing

- [ ] 7.1 Unit tests for fixture construction, show-scoped assignment, the distinct-class guard, and parameter provenance.
- [ ] 7.2 Contract tests for the reader/writer ratio, generation-mode reporting, and virtual-user fidelity.
- [ ] 7.3 Run every new or touched test with `--sequence.shuffle` at least six times; CI runs shuffled and local runs do not.
- [ ] 7.4 For any test that could be timeout-sensitive, reproduce under `taskpolicy -b pnpm vitest run <file> --coverage --sequence.shuffle`; shuffled fast runs do not surface timeout-class flakes.
- [ ] 7.5 Register any new test file in both `apps/myk9show/vitest.config.ts` and, if it covers edge-function code, `apps/myk9show/tsconfig.edge-tests.json`. Moving a registered test deregisters it.
- [ ] 7.6 Run `pnpm qa:code-quality-ratchet` from this worktree before pushing; nothing in typecheck, lint or the suite approximates it.
- [ ] 7.7 Redirect suite output to a file and read the real exit status rather than piping through `tail` or `grep`.

## 8. Targets

- [ ] 8.1 Move gate eligibility from scenario-level to per-target. `evaluateLoadResult` currently computes `gateEligible: scenario.gate === 'G9' && !scenario.informational` once for the whole run; each failure must instead carry whether it gates.
- [ ] 8.2 Mark API p95, scoring-write p95 and throughput informational-pending-derivation. Keep every other check gating: lifecycle consistency, queue drain, queue telemetry, persistence reconciliation, platform telemetry, connection cap, generator attribution, error rate, availability.
- [ ] 8.3 Report gating and informational failures as distinct sets in the evidence. A run that passes only the still-enforced half must not read as a clean pass.
- [ ] 8.4 Add a mutation check proving the split is non-vacuous: making a gating invariant informational must fail a test, and so must making a shape-dependent target gate before derivation.
- [ ] 8.5 After the first valid reshaped run, derive each shape-dependent target from observation plus a stated margin, citing the run it came from, and move it to the gating set.
- [ ] 8.6 Re-examine error rate and availability against that run. Sustained latency depresses availability through client timeouts without any request being served wrongly — run 33075234998 showed 99.29%. Moving either to informational is permitted only with a recorded reason.
- [ ] 8.7 Confirm `gate: 'G9'` is in force for the full target set once derivation completes.

## 9. Rehearsal

- [ ] 9.1 Obtain explicit operator approval for the reshaped rehearsal. The approval must name the new workload, the multi-show fixture and hybrid generation; approvals for the prior topology do not transfer.
- [ ] 9.2 Confirm the concurrency preflight still proves headroom against the account-wide ceiling of 20.
- [ ] 9.3 Run, then record evidence and the derived targets here.

## 10. Delivery gate

Required by `openspec/config.yaml`: PR, CI, review and merge are the final implementation gate before archive for code or workflow changes.

- [ ] 10.1 Open a PR for the implementation and link it here.
- [ ] 10.2 CI green, including `Quality Checks`. Run `pnpm qa:code-quality-ratchet` from the worktree first — a `cd` to the primary checkout silently measures `main`.
- [ ] 10.3 Independent review (Codex) on the net diff against `origin/main`. Grep the log for `Review was interrupted` and usage-limit markers; the exit status is not the verdict.
- [ ] 10.4 Merge to `main` from the primary checkout, never from a feature worktree.
- [ ] 10.5 Update MYK9-126 with what changed, checks run, PR link, risks, and whether acceptance criteria passed. Move to Done only after merge.
- [ ] 10.6 Archive this change with the PR URL or merge evidence in the summary.
