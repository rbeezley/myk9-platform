# Design

## Session budget

Derived from the operator's domain inputs. Every figure below is either observed or an explicitly flagged estimate.

| Source                                    | Scoring | Exhibitor check-in | Steward check-in | Readers | Ops    | Total   |
| ----------------------------------------- | ------- | ------------------ | ---------------- | ------- | ------ | ------- |
| Large show — 8 rings, 200 exhibitors      | 8       | 20                 | 8                | 120     | 4      | 160     |
| Mid show ×3 — 4 rings, 80 exhibitors each | 12      | 24                 | 12               | 144     | 6      | 198     |
| **Platform total**                        | **20**  | **44**             | **20**           | **264** | **10** | **358** |

Compare to today: 55 scoring, 15 check-in, 30 read. The proposal is close to the inverse and about 3.6× the total.

**Steward check-in is one session per ring**, matching the one-scorer-per-ring shape: the person working the gate for that ring. It is separate from exhibitor self-check-in because the two use different credentials and different mutations, but they take the same class-row lock. The **ops** sessions include the secretary class edits described under multi-actor contention below.

### How each figure was derived

**Scoring — observed.** One session per ring, on a distinct class. Eight at the large show, four at each mid-size show. This is the single most important change: no two scoring sessions may target the same class, because that is the condition that produced the artifact this change exists to remove.

**Readers — estimated at 60% of exhibitors.** The app's core show-day value is dogs-ahead, which people check repeatedly as their turn approaches, and mid-morning has the most classes running at once. Sixty percent is a defensible middle for a well-adopted app. It is the least-grounded number here and the first that should be replaced with real telemetry once there are users. It must be a parameter, not a constant.

**Check-in — estimated.** Modelled as exhibitor-driven, which the operator identified as the heavier of the two club patterns. At the large show, roughly two or three of eight classes are opening at any moment, and a 65-entry class checking in over a few minutes yields on the order of 20 concurrent writers. Scaled to 8 at a mid-size show. Bursty rather than uniform; the shape matters more than the count, because check-in contends with the judge on the same class row.

**Ops — nominal.** Show-desk and operations sessions, four at the large show and two at each mid-size show.

## Why the workload must span shows

Three shows' worth of load is not merely three times one show's.

`entries` is correctly show-scoped by RLS (`show_id IN (SELECT manageable_show_ids())`), so entry deltas never cross shows and a secretary's entry sync cost is bounded by their own show.

`dogs` and `classes` are not scoped that way at the replication layer. Both apply their filter conditionally:

- `ReplicatedDogsTable.fetchRemoteRows` applies `.eq('owner_id', scope.value)` only `if (scope.value)`.
- `ReplicatedClassesTable.fetchRemoteRows` applies `.eq('trial_id', scope.value)` only `if (scope.value)`.

A staff session has no owner scope, so its dog sync is unscoped and pulls every dog changed platform-wide since its watermark. This is permitted — `dogs_select` grants show managers platform-wide read via the unscoped `is_show_manager()`, deliberately, so a secretary can enter any dog into their show. Authorization is not in question.

What is in question is sync volume. A device being _allowed_ to read a row is not the same as that row needing to be _proactively downloaded_.

The two tables differ in how much that costs, and the distinction matters because the workload has to actually generate what it claims to measure:

- **`classes` churn cross-show.** The scoring and check-in workloads write entries, which fires `refresh_class_scoring_state` and advances `classes.updated_at` — so an unscoped classes sync genuinely pulls other shows' deltas. This is measurable as delta volume, and MYK9-248 makes it worse than it needs to be.
- **`dogs` barely churn during a show.** No declared workload in this scenario mutates `dogs`, and real show-day dog edits are rare. After reader watermarks establish, an unscoped dog poll returns little or nothing, so **delta volume is the wrong metric for it.** What remains real is the cost of the poll itself: run 33075234998 measured `dogs WHERE updated_at > $1` at 79.7 ms mean in-window with no owner filter — an index scan every device pays repeatedly to learn nothing.

The evidence requirement is therefore split accordingly: cross-show **delta volume** for classes, and scoped-versus-unscoped **sync counts and per-poll cost** for both. Claiming to measure platform-wide dog delta scaling without a workload that writes dogs would be measuring nothing and reporting it as a result.

Either way, a single-show fixture cannot surface any of it, because there is no second show generating deltas.

## Generation strategy

358 real Chromium contexts do not fit on sixteen free runners. The current 100 already drive them to 55–70% CPU p95.

Split generation by what each session actually proves:

| Session class                        | Count               | Generator              | Rationale                                                                             |
| ------------------------------------ | ------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Writers — scoring, both check-in kinds | 84                | Real browser           | Exercise the full client path: OCC, replication queue, offline store, mutation upload |
| Reader sample                        | 16 (one per runner) | Real browser           | Preserve rendering and hydration evidence; catch client-side regressions              |
| Reader bulk                          | 248                 | API-level virtual user | Backend load from a reader is HTTP — replication delta polls and PostgREST reads      |
| Ops, including secretary class edits | 10                  | Real browser           | Low count, distinct surface, and the one lock holder outside the entries trigger      |

That is **110 browser contexts across sixteen runners — six or seven each, the same as today** — plus 248 lightweight virtual users. Modelled load rises about 3.6× at unchanged per-runner browser cost.

An earlier draft of this section put writers at 64 and claimed browser contexts per runner would *fall*. Adding steward check-in and secretary class edits raised writers to 84, so the correct claim is parity, not improvement. Every writer session must stay on a real browser: OCC, the replication queue and the mutation upload path are exactly what a write workload has to exercise, and an API-level virtual user would bypass all three.

**The tradeoff, stated plainly:** an API-level reader cannot catch a client-side rendering regression. It issues the same requests but never paints. The sixteen browser readers exist precisely to keep that coverage, and the split must be documented in the evidence so a reader of a passing run knows which sessions proved what.

An API virtual user must reproduce the _request pattern_, not an approximation of it: the same delta-sync cadence, watermark advancement, and endpoint mix a real reader session issues. If it diverges, it measures a fiction. Deriving it from the same query builders the replication layer uses is preferable to hand-writing endpoint calls.

## Targets

Current `LoadTargets` do not carry over. `apiP95Ms: 200` and `scoringWriteP95Ms: 200` were set against a write-heavy shape that does not occur, and `throughputMin: 50` was calibrated to 100 sessions.

Re-derivation must happen **after** the first valid reshaped run, from observed behavior plus a defensible margin — not before, and not by scaling the old numbers. A threshold invented ahead of the measurement repeats the mistake this change corrects.

But suspending the whole gate to re-derive three numbers is heavier than the problem. Only some targets move with workload shape:

- **Shape-dependent:** API p95, scoring-write p95, throughput. All three are a function of how many sessions do what, so their current values carry no information about the reshaped workload.
- **Shape-independent:** session-lifecycle consistency, queue drain, queue-telemetry completeness, persistence reconciliation, platform-telemetry completeness, connections within the verified cap, generator attribution validity. A scoring write that vanishes or a queue that never drains is a defect whether one judge is scoring or seven.

So gate eligibility becomes **per target** rather than per scenario: the three shape-dependent numbers report as informational until derived, and everything else keeps gating. That closes most of the coverage gap without fabricating a threshold.

Error rate and availability are the awkward pair. Conceptually they are shape-independent — a request either succeeded or it did not, and 99.5% is a product decision. In practice sustained latency produces client timeouts that depress availability without any request being served wrongly, which is close to what run 33075234998 showed at 99.29%. They keep gating initially, and moving them is permitted only with a recorded reason, so the gate cannot quietly narrow.

### Structural consequence

`evaluateLoadResult` currently decides eligibility once for the whole scenario:

```ts
gateEligible: scenario.gate === 'G9' && !scenario.informational;
```

Per-target gating needs each failure to carry whether it gates, and the evaluation to report gating and informational failures separately. That is new structure rather than a config edit, and it is the one piece of implementation this change adds beyond the workload itself. Evidence must render the two sets distinctly, or a reader cannot tell a passing run from a run that passed only the half still being enforced.

## Multi-actor contention on one class row

One scorer per class removes the invalid 55-scorer contention, but it does not make a class row single-writer. Five paths take a row-exclusive lock on it, held to commit — all but the last reaching it through `refresh_class_scoring_state`:

| Actor | Write |
| --- | --- |
| Judge scoring | `is_scored`, `result_status`, faults / time / points |
| Steward or secretary check-in | `check_in_status` |
| Exhibitor self-check-in | `check_in_status` (online-only) |
| Scratch, pull or move | `entry_status`, `class_id`, `deleted_at` |
| Secretary editing the class | `classes` directly, via `ReplicatedClassesTable.updateClass` |

When a class is called these overlap: the steward works the gate while exhibitors self-check-in, the judge starts scoring, and the secretary may adjust the ring. Four to ten concurrent writers on one row is plausible.

That is not the same failure as the invalid workload, and the difference is duration. Fifty-five scorers wrote continuously for ten minutes; this is a burst at class start followed by a judge writing once every thirty to ninety seconds. **Peak concurrency is comparable; sustained concurrency is not.**

MYK9-248 removes both check-in rows from that table by narrowing the trigger's `WHEN` clause and making the class `UPDATE` conditional. The secretary class edit survives, because it never goes through the entries trigger. So the scenario must run both before and after that fix — it is the instrument that measures it, and a scenario that only models the post-fix world would leave the fix's effect unquantified.

Targeting matters as much as the counts: these actors must drive classes that are **concurrently being scored**. Spread across idle classes they measure nothing, because contention is the property under test.

## Peak and stress

`PEAK_SCENARIO` and `STRESS_SCENARIO` derive from `G9_NORMAL_SCENARIO` and raise ringside sessions to 125 and 250 against the same eight-class fixture — 15 and 31 concurrent scorers per class. They are the same impossibility as `normal`, scaled up, and the one-scorer-per-class invariant makes them unconstructable as written.

They scale by **shows and rings** instead. That is also how growth actually arrives: the operator expects 3–5 concurrent shows now, "depending on how popular our app becomes," and a busier platform means more shows running, not more judges crowding one ring. `ringsideSessionsMin` scales with the fixture rather than staying fixed.

Both remain informational and both remain unrunnable on the free tier at their full session counts; hybrid generation improves that arithmetic but does not by itself make them dispatchable. The requirement here is that they be _coherent_, not that they be runnable today.

## Concurrency budget

The account-wide GitHub Free ceiling of 20 concurrent jobs is unchanged. The topology stays at sixteen shards plus one platform sampler plus prepare/aggregate, which already fits. Hybrid generation is what keeps a 3.4× workload inside the same seventeen concurrent jobs.
