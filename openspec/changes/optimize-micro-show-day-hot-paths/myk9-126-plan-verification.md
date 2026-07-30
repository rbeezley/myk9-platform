# MYK9-126 Plan Verification

## Requirements Audit

| Requirement                                                                       | Initial status | Patched evidence                                        |
| --------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| Preserve the 100-session / 55-ringside Micro workload and thresholds              | Covered        | Existing proposal/spec plus tasks 14.3–14.6             |
| Capture per-runner CPU, memory, event loop, browser responsiveness, and readiness | Missing        | Design §12; generator-validity spec; tasks 11–12        |
| Separate prepared/open sessions from workflow lifetime                            | Missing        | Design §13; session-lifecycle spec; tasks 11.3 and 12.2 |
| Preserve per-shard evidence instead of averaging saturation away                  | Missing        | Design §12; generator-validity spec; task 12.3          |
| Decide four-runner versus wider free-runner topology from evidence                | Partial        | Design §§12 and 14; tasks 14.3–14.4                     |
| Address remaining backend/page long tail only after a valid measurement           | Partial        | Design §14; tasks 14.5–14.6                             |
| Keep compute upgrade and threshold reductions out of scope                        | Covered        | Proposal non-goals; design §14                          |
| Include focused tests, broad verification, PR/CI, deployment, rerun, and cleanup  | Missing        | Tasks 11–14                                             |

## Initial Coverage: 44/100

The previous change correctly contained the replication/startup storm and made workflow failures
visible, but it did not measure generator health and conflated workflow overlap with open browser
sessions. That prevented the corrected run from separating runner saturation from backend latency.

## Patched Coverage: 100/100

The proposal, design, delta spec, risks, baseline, and tasks now cover generator validity,
session-lifecycle correctness, topology comparison, remaining latency work, and every local,
review, shared-system, rerun, and cleanup gate.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes the launch-blocking distributed load harness and the evidence used to
  decide whether Supabase Micro is adequate.
