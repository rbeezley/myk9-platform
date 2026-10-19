# Batch 3 scoring and placement verification

## Original request

“proceed” — accepting batch 3 for MYK9-1246, MYK9-1230 and MYK9-1234, using isolated fixtures without changing shared data, recording every acceptance criterion and closing only passing issues.

## Why

Secretary score checking and printed placements must agree before fall 2026 launch. The score-save and print-order fixes are merged, but browser evidence is missing and manually completed classes can have no stored placements.

## What Changes

- Verify both existing scoring paths, reload persistence, single/multiple entries, and rejected saves using disposable local data.
- Verify merged #3094's canonical placements for fully accounted-for manual classes without changing their manual status.
- Compare Check Scores, Fix and printed results for Vehicle Novice A and a second class, including ties and non-qualifiers.
- Record source SHA, SQL/browser evidence, tests and cleanup; retain unmet deployed-build or incident-reproduction gates explicitly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `class-status-derivation`: fully accounted-for manual classes receive canonical placements while manual status remains protected, as implemented by #3094.

## Impact

Tracking: [MYK9-1246](https://linear.app/myk9-platform/issue/MYK9-1246), [MYK9-1230](https://linear.app/myk9-platform/issue/MYK9-1230), [MYK9-1234](https://linear.app/myk9-platform/issue/MYK9-1234).

Isolated browser proof, dedicated disposable CI and evidence for existing results/scoring consumers. Implementation migrations/tests are already merged in #3077, #3080 and #3094; no duplicate migration is included here. No new UI surface, payment, notification, shared fixture changes, new scoring system or opportunistic refactor. Shared migration application/deployment require a separately authorized, concrete operation; preparation and isolated proof proceed first.
