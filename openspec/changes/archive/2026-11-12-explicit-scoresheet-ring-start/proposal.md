## Why

Opening an unscored sheet currently changes the dog's status before judging starts. Returning with Back can briefly show that status even after the server restores the dog. Separating navigation from scoring makes the running order reliable for fall 2026.

Tracking: [MYK9-1779](https://linear.app/myk9-platform/issue/MYK9-1779).

## What Changes

- Opening a scoresheet leaves check-in and ring time alone.
- Starting the existing live timer marks the dog In ring. Leaving an explicitly started, unscored run still restores its prior state.
- Score submission and the existing manual ring controls keep their current behavior.

## Capabilities

### New Capabilities

- `explicit-scoresheet-ring-start`: separates scoresheet navigation from starting a timed run.

### Modified Capabilities

None.

## Impact

The ringside and secretary scoring routes share the same replication hook. Timed live sheets use their existing Start control, so this adds no duplicate page, action, or dialog. Untimed scoring and report flows are outside scope.
