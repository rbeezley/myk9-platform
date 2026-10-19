# Proposal

## Original request

“Start batch 4 and ship it through completion. Fix the next set of Linear issues in review, verify them in isolation without changing shared data, and close those whose acceptance criteria pass.”

## Why

Secretary paperwork reliability supports fall 2026 launch readiness. MYK9-1244's Overview print workflow (#3085) and MYK9-1225's centisecond formatter (#3091) are merged; their remaining gates are browser evidence. Verify existing behavior before proposing another implementation.

## What Changes

- Prove 61.23 stored seconds render as 1:01.23 on the real secretary run sheet and agree with the judge's display, preserving intentional exhibitor rounding.
- Exercise Overview preview/batch print, persistent printed rows, undo and Reports agreement at 375px and desktop using a disposable local stack.
- Inspect real PDF/HTML artifacts and actual browser print lifecycle; distinguish headless/engine evidence from a real native-dialog close or cancel. Leave an unproven native gate open.
- Fix only reproduced gaps, using the existing report/mutation paths and regression-first tests. Any product behavior change requires a matching spec delta before implementation.
- Reuse the existing short isolated verification job, not another duplicate workflow. Ship one PR, require appropriate review and final-source CI, then close only fully evidenced issues.

## Capabilities

No new or modified product requirements are proposed. This evidence/tooling change opts out of spec deltas with `skip_specs: true`. Existing Overview, Reports and scoring surfaces remain the user workflow; no new UI surface duplicates them.

## Impact

Tracking: [MYK9-1244](https://linear.app/myk9-platform/issue/MYK9-1244), [MYK9-1225](https://linear.app/myk9-platform/issue/MYK9-1225).

Scope: isolated proof/config, evidence and only verified fixes. No shared fixture/scoring writes, payments, notifications, linked migrations, deployments or unrelated refactors. MYK9-1233 remains outside this batch because its only remaining gate is a physical label-stock print by the owner.
