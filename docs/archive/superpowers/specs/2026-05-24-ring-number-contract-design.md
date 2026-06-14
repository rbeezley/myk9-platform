# Ring Number Contract Design

Date: 2026-05-24

## Problem

PR #290 proved that `classes.ring_number` does not exist in migrations or the linked database. The app now avoids failed show-day and check-in queries by mapping unavailable ring values to `null` or `0`, but several renderers still interpolate ring values directly. That can show exhibitors, secretaries, judges, or stewards labels such as `Ring 0`, `Ring null`, or `Ring Unknown`.

Ring assignments are real for some sports, especially conformation-style schedules, but they are not a normal requirement for Scent Work. The current app needs a contract that supports both facts without inventing schema too early.

## Decision

Treat ring assignment as optional and sport-dependent. Current show-day, check-in, judge, steward, and notification-facing contracts should represent missing ring data as `null`, not `0`.

This slice will not add a database migration. Persisted ring assignment belongs in a later sport-aware scheduling model that can decide whether rings attach to classes, trials, sessions, time blocks, or another scheduling entity.

## Contract

Use one of these shapes at UI boundaries:

```typescript
ringNumber: number | null;
ringLabel: string | null;
```

Unknown ring data must normalize to `null`. Valid ring data may render as a display label.

Normalization rules:

- `null`, `undefined`, `0`, `''`, and `'0'` become `null`.
- `2` becomes `Ring 2`.
- `'2'` becomes `Ring 2`.
- `'Ring 2'` stays `Ring 2`.
- Non-empty named locations may pass through when they are already user-facing labels.

## UI Behavior

Scent Work screens omit ring text when no ring value exists. Other sport screens may show a ring label once real scheduling data provides one.

No production renderer should show `Ring 0`, `Ring null`, or `Ring Unknown`. If a surface needs a fallback phrase, it should use plain context-specific copy such as `Ring not assigned` only where that missing value is actionable.

## Implementation Scope

Add a small shared formatter for ring display values and use it in the highest-risk show-day and check-in renderers. Replace `0` defaults in current mapping code with `null` where the type represents unknown ring data.

Audit production code that renders `Ring ${value}` or `Ring {value}` directly. Keep demo, marketing, and test fixture strings out of scope unless they feed a real runtime path.

## Testing

Add unit tests for the formatter. Cover the nullish and zero cases first, then numeric and already-formatted values.

Update show-day and class check-in tests so missing ring data expects `null` and omitted ring text, not `0`. Add renderer tests for surfaces most likely to expose exhibitors or show-day staff to invalid ring labels.

## Non-Goals

Do not add `classes.ring_number` in this slice. Do not design the full scheduling model. Do not remove ring concepts from the product, because rings matter for non-Scent Work sports.
