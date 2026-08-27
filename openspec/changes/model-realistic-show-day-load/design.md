# Design

## Session budget

Derived from the operator's domain inputs. Every figure below is either observed or an explicitly flagged estimate.

| Source                                    | Scoring | Check-in | Readers | Ops    | Total   |
| ----------------------------------------- | ------- | -------- | ------- | ------ | ------- |
| Large show — 8 rings, 200 exhibitors      | 8       | 20       | 120     | 4      | 152     |
| Mid show ×3 — 4 rings, 80 exhibitors each | 12      | 24       | 144     | 6      | 186     |
| **Platform total**                        | **20**  | **44**   | **264** | **10** | **338** |

Compare to today: 55 scoring, 15 check-in, 30 read. The proposal is close to the inverse and about 3.4× the total.

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

What is in question is sync volume. A device being _allowed_ to read a row is not the same as that row needing to be _proactively downloaded_. Cross-show delta volume scales with platform activity rather than with the operator's own show, and a single-show fixture cannot surface it at any session count, because there is no second show generating deltas. Measuring it is a primary reason this change exists.

## Generation strategy

338 real Chromium contexts do not fit on sixteen free runners. The current 100 already drive them to 55–70% CPU p95.

Split generation by what each session actually proves:

| Session class               | Count               | Generator              | Rationale                                                                             |
| --------------------------- | ------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Writers — scoring, check-in | 64                  | Real browser           | Exercise the full client path: OCC, replication queue, offline store, mutation upload |
| Reader sample               | 16 (one per runner) | Real browser           | Preserve rendering and hydration evidence; catch client-side regressions              |
| Reader bulk                 | 248                 | API-level virtual user | Backend load from a reader is HTTP — replication delta polls and PostgREST reads      |
| Ops                         | 10                  | Real browser           | Low count, distinct surface                                                           |

That is 90 browser contexts across sixteen runners — under six per runner, **fewer than today's six to seven** — plus 248 lightweight virtual users. Runner headroom improves while modelled load triples.

**The tradeoff, stated plainly:** an API-level reader cannot catch a client-side rendering regression. It issues the same requests but never paints. The sixteen browser readers exist precisely to keep that coverage, and the split must be documented in the evidence so a reader of a passing run knows which sessions proved what.

An API virtual user must reproduce the _request pattern_, not an approximation of it: the same delta-sync cadence, watermark advancement, and endpoint mix a real reader session issues. If it diverges, it measures a fiction. Deriving it from the same query builders the replication layer uses is preferable to hand-writing endpoint calls.

## Targets

Current `LoadTargets` do not carry over. `apiP95Ms: 200` and `scoringWriteP95Ms: 200` were set against a write-heavy shape that does not occur, and `throughputMin: 50` was calibrated to 100 sessions.

Re-derivation must happen **after** the first valid reshaped run, from observed behavior plus a defensible margin — not before, and not by scaling the old numbers. A threshold invented ahead of the measurement repeats the mistake this change corrects.

Until then the reshaped scenario runs `informational: true`, and G9 remains ungated. That is deliberate: it is better to hold the gate open briefly than to keep certifying against a shape that cannot happen.

## Concurrency budget

The account-wide GitHub Free ceiling of 20 concurrent jobs is unchanged. The topology stays at sixteen shards plus one platform sampler plus prepare/aggregate, which already fits. Hybrid generation is what keeps a 3.4× workload inside the same seventeen concurrent jobs.
