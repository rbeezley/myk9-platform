## Why

The G9 gate has been certifying against a workload that cannot occur.

`G9_NORMAL_SCENARIO` runs 55 concurrent `ringside-scoring` sessions, and `loadEntryFixture` distributes entries across eight class IDs by `(entryNumber - 1) % 8`. That places roughly seven sessions scoring seven different dogs in the same class at the same instant, continuously, for ten minutes. A class is scored by one judge, one dog at a time.

The number was never modelled. Every prior change explicitly preserved it — "retain exactly 100 sessions, 55 ringside" (`separate-g9-generator-saturation/tasks.md`), "MUST retain exactly 100 sessions, 55 ringside sessions" (its spec), "the unchanged 100-session/55-ringside rehearsal" (its proposal). The workload was frozen early and defended ever since, so the scoping question was never asked.

Run 33075234998 was the first rehearsal with valid backend attribution — all sixteen generators HEALTHY, browser-control p95 of 7.5–21 ms — and it failed with a 9.4 s scoring-write p95. Investigation traced that to lock queueing: every score write fires `refresh_class_scoring_state`, which takes a row-exclusive lock on the class row and holds it to commit, so seven concurrent scorers per class serialize. At one judge per class there is no queue. The measured p95 is an artifact of the scenario, not a property of the platform.

The targets are unvalidated for the same reason. `apiP95Ms: 200` and `scoringWriteP95Ms: 200` were chosen against a write-heavy shape that does not happen, and the read path that would actually dominate a show day is barely exercised — 15 exhibitor sessions and 10 run-order sessions out of 100.

## Domain inputs

Supplied by the operator on 2026-08-27 and recorded here so the numbers can be challenged rather than inherited:

- The largest show observed ran **8 judges scoring concurrently**, each in a separate ring on a separate class.
- That show had **200 exhibitors**, checking into various classes concurrently.
- **3–5 shows run concurrently** on the platform on a busy weekend, growth-dependent.
- Mid-size shows run **4 rings**.
- Check-in is performed by exhibitors at some clubs and by a gate steward or secretary at others; the scenario models the heavier exhibitor-driven case.
- Concurrently-connected exhibitors at peak was not known and is **estimated at 60%** — see `design.md`.

## What Changes

- Reshape the workload so scoring is one session per ring on a **distinct** class, never two sessions on the same class row.
- Replace the single-show fixture with a multi-show fixture: one large show (8 rings, 200 exhibitors) plus three mid-size shows (4 rings, 80 exhibitors each).
- Rebalance the mix from write-dominant to read-dominant, matching a show day where most participants are watching run order rather than writing.
- Model check-in as exhibitor-driven and bursty at class start, since that is both the heavier case and the one that genuinely contends with a judge on the same class row.
- Introduce hybrid generation: real browsers for every writer session plus a per-runner browser reader sample, with the bulk of reader load generated as API-level virtual users.
- Re-derive `LoadTargets` against the reshaped workload; the current thresholds do not carry over. Move gate eligibility from scenario-level to per-target so the three shape-dependent numbers — API p95, scoring-write p95, throughput — report informational until derived, while every shape-independent invariant keeps gating. Suspending the whole gate to re-derive three numbers would open it far wider than the remodel requires.
- Express session counts as documented parameters with stated provenance, so a future change revises them instead of preserving them.

Non-goals:

- No change to the fail-closed teardown, drain, ownership-window or platform-telemetry machinery from `separate-g9-generator-saturation`. That work is sound and independent.
- No compute-tier upgrade. Run 33075234998 showed CPU under 30%, IOPS below 1, disk throughput at 9.6 KB/s and connections at 31 of 60 — the instance was not the constraint.
- No application or database change. The trigger inefficiency found during this investigation is tracked separately as MYK9-248.
- No new product surface.

## Capabilities

### New Capabilities

- `show-day-load-workload-realism`: Defines a load workload derived from observed show operations, spanning concurrent shows, with generation that fits the free-runner budget.

### Modified Capabilities

- `g9-rehearsal-safety`: the "Generator topology preserves the unchanged G9 workload" requirement is restated in `specs/g9-rehearsal-safety/` with the frozen session counts removed and the topology guarantee intact. A prose note in the older change would not have been enough — its `MUST retain exactly 100 sessions, 55 ringside sessions` is normative, and leaving it standing beside a contradicting one would give verification two mutually exclusive contracts.

## Impact

- `apps/myk9show/src/test/load/loadScenario.ts` workload definitions and targets.
- `apps/myk9show/src/test/load/loadFixture.ts` — currently a single `LOAD_SHOW_ID` and a fixed eight-element `LOAD_CLASS_IDS`; becomes multi-show with per-show ring counts.
- `apps/myk9show/src/test/load/loadAssignments.ts` and the shard assignment path, to map a session to a show as well as a class.
- A new API-level virtual-user generator alongside `loadBrowserRunner.ts`.
- `apps/myk9show/src/test/load/loadEvaluation.ts` — per-target gate eligibility, replacing the single scenario-level `gateEligible`, and evidence that renders gating and informational failures as distinct sets.
- Seed data for the additional shows, plus a staff identity per show and exhibitor identities owning or handling entries. One cloned secretary auth state across all sessions would defeat the show-scoping this fixture exists to measure.
- `apps/myk9show/src/test/load/README.md` scenario ladder and concurrency arithmetic.
- No production application code, no migration, no user-facing change.
