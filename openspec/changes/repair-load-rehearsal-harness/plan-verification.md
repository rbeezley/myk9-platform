## Plan Verification

### Requirements Audit

| Requirement                                              | Initial status | Evidence / gap                                                                                                |
| -------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| Repair Playwright entry points with non-zero discovery   | Covered        | Tasks 2.1, 3.1–3.3; design “Use a dedicated Playwright load configuration”                                    |
| Audit all existing harness halves for staleness          | Covered        | Tasks 1.1–1.2 and 4.5                                                                                         |
| Model scoring, check-in, exhibitor, run-order/dogs-ahead | Covered        | Tasks 4.1–4.2; Normal workload spec                                                                           |
| Carry at least 50 ringside sessions in 100-user Normal   | Covered        | Proposal, design, Normal workload and evaluator specs                                                         |
| Extend canonical seed to approximately 500 entries       | Partial        | Deterministic/multi-class plan existed, but the exact generated and final counts were ambiguous               |
| Target staging/E2E, never production                     | Covered        | Fail-closed target requirement and Tasks 1.3, 8.1–8.2                                                         |
| Peak CPU/IO and connections vs 60                        | Covered        | Evidence requirement and Tasks 4.3, 8.2–8.3                                                                   |
| `pg_stat_statements` top total-time evidence             | Partial        | Final collection existed, but cumulative data was not isolated to the rehearsal                               |
| Scoring-write p95 and `40001` retry rate                 | Partial        | Metrics existed, but the conflict-rate denominator and retry outcome accounting were undefined                |
| Replication queue-depth evidence                         | Partial        | Maximum/final depth existed, but no bounded drain or persisted-score pass condition was stated                |
| Grade every scenario against its own thresholds          | Covered        | Pure evaluator decision/spec and Tasks 2.2, 4.4                                                               |
| Throughput and availability are pass criteria            | Covered        | Evaluator and Normal budget spec                                                                              |
| State ceiling and compute tier                           | Covered        | Evidence requirement and Tasks 1.3, 8.2–8.3                                                                   |
| Decide recurring workflow                                | Covered        | Safe anti-rot decision/spec and Tasks 6.1–6.3                                                                 |
| Handle failed/partial/interrupted runs                   | Partial        | Evidence preservation existed, but remote fixture recovery after interruption was not explicit                |
| Protect credentials and evidence                         | Missing        | Target safety existed, but secret/header/storage-state redaction was not explicit                             |
| Follow TypeScript and file-size constraints              | Missing        | The first draft did not state how the >500-line legacy files would be split or how JS assets would be handled |
| Test, review, CI, PR, merge, tracking, archive           | Covered        | Tasks 7–9 and Validation Profile                                                                              |

### Initial Coverage: 88/100

The plan covered the functional gate and execution sequence, but telemetry truthfulness, recovery,
secret hygiene, and repository implementation constraints needed explicit contracts.

### Top Gaps

1. Cumulative database metrics could attribute old workload to this rehearsal.
2. Retry success could hide a high conflict rate or undrained replication queues.
3. A failed remote rehearsal could leave the canonical fixture mutated.
4. Credentials/evidence redaction and TypeScript/500-line constraints were unstated.

### Patched Plan

- **[ADDED]** Baseline/final `pg_stat_statements` deltas and sampled peak activity.
- **[EXPANDED]** `40001` denominator, retry outcomes, bounded queue drain, and persisted-score
  reconciliation.
- **[EXPANDED]** Exact fixture shape: 504 generated active rows (63 dogs × 8 non-finalized
  classes) plus ten hand-authored rows.
- **[ADDED]** Sanitized logs/evidence and explicit secret/header/storage-state exclusions.
- **[ADDED]** Success/failure/interruption cleanup through the canonical reseed lifecycle.
- **[ADDED]** TypeScript-only new implementation and under-500-line module boundaries.

### Post-patch Coverage: 100/100

Every extracted requirement now has a cited implementation task, normative specification, and
failure/recovery behavior. The approved target/compute tier remains an explicit operator gate, but
it does not block the local repair, contracts, seed implementation, or isolated verification.

## Distributed free-runner re-verification — 2026-07-28

### Requirements Audit

| Requirement                                                   | Initial status | Evidence / gap                                                                          |
| ------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| Use only free GitHub/Vercel capabilities                      | Missing        | The prior design assumed one local host and did not define a free remote generator      |
| Preserve exactly 100 concurrent role-bound sessions           | Partial        | The scenario was exact, but there was no distributed assignment or global-ramp contract |
| Prevent the runner host from masquerading as Supabase failure | Partial        | The risk was named, but local timeouts did not fail as generator-incomplete evidence    |
| Synchronize independently provisioned jobs                    | Missing        | No common future-start barrier or late-shard failure existed                            |
| Aggregate p95 and counters truthfully                         | Missing        | Per-shard percentiles cannot be averaged; raw-sample aggregation was undefined          |
| Collect one coherent platform window                          | Partial        | Platform sampling existed only inside a single-process run                              |
| Keep secrets out of source/artifacts                          | Covered        | Existing fail-closed target and redaction requirements remain applicable                |
| Restore remote state after any matrix outcome                 | Partial        | Local finally cleanup existed, but cross-job failure/cancellation cleanup was undefined |
| Keep routine CI free of shared writes                         | Covered        | Existing source-only anti-rot requirement remains unchanged                             |
| Verify with unit, workflow, smoke, and full evidence          | Partial        | Existing verification did not include shard/aggregate contracts or workflow syntax      |

### Initial Coverage: 56/100

The original plan truthfully covered a single generator but could not convert four independent
free runners into one exact, recoverable G9 observation.

### Top Gaps

1. No synchronization or shard-completeness contract.
2. No exact global percentile/counter aggregation.
3. No cross-job cleanup guarantee after partial failure.
4. No free-account execution design.

### Patched Plan

- **[ADDED]** Four standard public-repository runners with 25 unique global assignments each.
- **[ADDED]** Shared future UTC barrier and fail-closed late/missing/duplicate shard validation.
- **[ADDED]** Raw sanitized duration samples and exact aggregate percentile calculation.
- **[ADDED]** Exactly one platform sampler spanning the shared load window.
- **[ADDED]** Manual-only workflow, no Vercel dependency, and always-run canonical cleanup.
- **[ADDED]** Assertion-first shard, aggregation, workflow, and recovery tests.

### Post-patch Coverage: 100/100

Every free-account, synchronization, aggregation, safety, recovery, and verification requirement
now has a normative scenario and implementation task. External secret installation and workflow
execution remain explicit shared-system approval gates.
