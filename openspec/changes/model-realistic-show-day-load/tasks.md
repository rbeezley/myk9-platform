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

## 4. Workload mix and parameters

- [ ] 4.1 Express every session count as a parameter with provenance — operator-observed or estimated, and for estimates what would replace them.
- [ ] 4.2 Set counts per `design.md`: 20 scoring, 44 check-in, 264 readers, 10 ops across four shows.
- [ ] 4.3 Give check-in a bursty arrival pattern anchored to class start rather than uniform arrival.
- [ ] 4.4 Assert the reader-to-writer ratio in a contract test, so a future edit that inverts the mix fails rather than passing quietly.

## 5. Hybrid generation

- [ ] 5.1 Build an API-level virtual-user generator that reuses the replication layer's own query construction rather than hand-written endpoint calls.
- [ ] 5.2 Add a contract test asserting the virtual user's endpoint mix and sync cadence match a real reader session's; fail on divergence.
- [ ] 5.3 Keep every writer session and one reader per runner on a real browser.
- [ ] 5.4 Report browser-generated versus API-generated counts per workload kind in the aggregate evidence.
- [ ] 5.5 Confirm the browser context count per runner has not increased over the current six to seven.

## 6. Cross-show observability

- [ ] 6.1 Attribute replication delta volume to the originating show, so cross-show pull is visible in evidence.
- [ ] 6.2 Record unscoped versus scoped sync counts for `dogs` and `classes`.

## 7. Testing

- [ ] 7.1 Unit tests for fixture construction, show-scoped assignment, the distinct-class guard, and parameter provenance.
- [ ] 7.2 Contract tests for the reader/writer ratio, generation-mode reporting, and virtual-user fidelity.
- [ ] 7.3 Run every new or touched test with `--sequence.shuffle` at least six times; CI runs shuffled and local runs do not.
- [ ] 7.4 For any test that could be timeout-sensitive, reproduce under `taskpolicy -b pnpm vitest run <file> --coverage --sequence.shuffle`; shuffled fast runs do not surface timeout-class flakes.
- [ ] 7.5 Register any new test file in both `apps/myk9show/vitest.config.ts` and, if it covers edge-function code, `apps/myk9show/tsconfig.edge-tests.json`. Moving a registered test deregisters it.
- [ ] 7.6 Run `pnpm qa:code-quality-ratchet` from this worktree before pushing; nothing in typecheck, lint or the suite approximates it.
- [ ] 7.7 Redirect suite output to a file and read the real exit status rather than piping through `tail` or `grep`.

## 8. Targets

- [ ] 8.1 Ship the reshaped scenario `informational: true`; do not carry the old thresholds over.
- [ ] 8.2 After the first valid reshaped run, derive targets from observation plus a stated margin, citing the run each came from.
- [ ] 8.3 Only then restore `gate: 'G9'`.

## 9. Rehearsal

- [ ] 9.1 Obtain explicit operator approval for the reshaped rehearsal. The approval must name the new workload, the multi-show fixture and hybrid generation; approvals for the prior topology do not transfer.
- [ ] 9.2 Confirm the concurrency preflight still proves headroom against the account-wide ceiling of 20.
- [ ] 9.3 Run, then record evidence and the derived targets here.
