# Plan 003: Fix `calculateTotalAreaTime` dropping a legitimate 0-second area time

> **Status:** Complete

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `docs/improve-audit-2026-06/README.md`.
>
> **Drift check (run first)**: `git diff --stat deb820e35..HEAD -- packages/scoring/src/utils/calculationUtils.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `deb820e35`, 2026-06-21

## Why this matters

`calculateTotalAreaTime` uses a truthiness check (`if (area1Time)`) to decide
whether to add each area's time. JavaScript treats `0` as falsy, so the `0`
branch is skipped. **Be honest about the impact**: adding `0` versus skipping
`0` produces the same total, so there is no current numeric defect — this is a
*contract/clarity* fix, not a behavior-changing bug. It still matters because
(a) the function's own JSDoc says the "missing" sentinels are `null`/`undefined`,
not zero, and the code contradicts that; and (b) a truthiness check on a
`number | null` value is a latent trap — the next person who adds a fourth area
or copies this pattern inherits the bug in a context where the value *isn't*
zero. The fix is to replace the falsy checks with explicit nullish guards and
pin the contract with tests. Do not oversell this as a production bugfix in the
PR description.

## Current state

- `packages/scoring/src/utils/calculationUtils.ts:40-60` — the function:

  ```ts
  // calculationUtils.ts (JSDoc above promises null/undefined handling, e.g.
  //   "calculateTotalAreaTime(45, null, null) // 45 seconds")
  export function calculateTotalAreaTime(
    area1Time?: number | null,
    area2Time?: number | null,
    area3Time?: number | null
  ): number {
    let totalTime = 0;

    if (area1Time) {            // ← drops a real 0
      totalTime += area1Time;
    }

    if (area2Time) {            // ← drops a real 0
      totalTime += area2Time;
    }

    if (area3Time) {            // ← drops a real 0
      totalTime += area3Time;
    }

    return totalTime;
  }
  ```

- **Convention**: this package (`@myk9/scoring`) is tested with vitest and reads
  `src` directly (its own suite is not affected by the app's `dist` build).
  Existing helper tests live alongside the helpers under
  `packages/scoring/src/utils/` and `packages/scoring/src/`. Match that style.

## Commands you will need

| Purpose   | Command                                                                              | Expected on success |
|-----------|--------------------------------------------------------------------------------------|---------------------|
| Install   | `pnpm install`                                                                       | exit 0              |
| Typecheck | `pnpm --filter @myk9/scoring typecheck` (or root `pnpm typecheck`)                   | exit 0              |
| Test      | `pnpm --filter @myk9/scoring test -- calculationUtils`                               | all pass            |
| Rebuild   | `pnpm --filter @myk9/scoring build`                                                  | exit 0              |

> Note: app-level vitest runs against a package's built `dist`, so after editing
> `packages/scoring/src` you must rebuild the package before any *app* test would
> see the change. The package's own suite reads `src` directly.

## Scope

**In scope**:
- `packages/scoring/src/utils/calculationUtils.ts`
- A test file for this function. If `packages/scoring/src/utils/calculationUtils.test.ts`
  exists, extend it; otherwise create it.

**Out of scope** (do NOT touch):
- Other functions in `calculationUtils.ts` (e.g. `formatTimeDisplay`) — they are
  not part of this finding.
- Any caller of `calculateTotalAreaTime` — the change is backward compatible
  (only the `0` case changes, and `0` was never a valid "skip" sentinel per the
  JSDoc).

## Git workflow

- Branch: `advisor/003-area-time-zero`
- Commit style: conventional commits. Suggested:
  `fix(scoring): count a 0-second area time in calculateTotalAreaTime`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the contract tests

Add tests that document the intended contract. **Expect them to pass both before
and after the fix** — because `0` adds nothing numerically, they cannot go red
on the current code. That is fine and expected: their job is to lock the
contract so a future regression (e.g. someone switching `+=` for a max, or
adding a non-zero falsy sentinel) is caught.

```ts
import { calculateTotalAreaTime } from './calculationUtils';

it('counts a 0-second area as a real value, not a missing one', () => {
  expect(calculateTotalAreaTime(0, 30, 0)).toBe(30);
  expect(calculateTotalAreaTime(0, 0, 0)).toBe(0);
  expect(calculateTotalAreaTime(45, 0, 12)).toBe(57);
});

it('treats null and undefined as missing (0 contribution)', () => {
  expect(calculateTotalAreaTime(45, null, undefined)).toBe(45);
  expect(calculateTotalAreaTime(undefined, undefined, undefined)).toBe(0);
});
```

**Verify**: `pnpm --filter @myk9/scoring test -- calculationUtils` → all pass.

### Step 2: Replace the truthiness checks with explicit null/undefined guards

```ts
if (area1Time != null) {
  totalTime += area1Time;
}
if (area2Time != null) {
  totalTime += area2Time;
}
if (area3Time != null) {
  totalTime += area3Time;
}
```

(`!= null` matches both `null` and `undefined` and nothing else — it is the
idiomatic guard for the `number | null | undefined` input.)

**Verify**: `pnpm --filter @myk9/scoring test -- calculationUtils` → all pass.
`pnpm --filter @myk9/scoring typecheck` → exit 0.

### Step 3: Rebuild the package

**Verify**: `pnpm --filter @myk9/scoring build` → exit 0.

## Test plan

- Tests in `packages/scoring/src/utils/calculationUtils.test.ts` covering:
  happy path (all three present, non-zero); a 0 in each position; `null` and
  `undefined` treated as missing; all-missing → 0.
- Model after any existing `*.test.ts` beside a util in `packages/scoring/src`.
- Verification: `pnpm --filter @myk9/scoring test -- calculationUtils` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n "if (area1Time)" packages/scoring/src/utils/calculationUtils.ts`
      returns no match (truthiness checks replaced)
- [ ] `pnpm --filter @myk9/scoring typecheck` exits 0
- [ ] `pnpm --filter @myk9/scoring test -- calculationUtils` passes (new cases
      present)
- [ ] `pnpm --filter @myk9/scoring build` exits 0
- [ ] `git status` shows only the two in-scope files modified/created
- [ ] `docs/improve-audit-2026-06/README.md` status row for 003 updated

## STOP conditions

Stop and report if:

- The function signature or body differs from the "Current state" excerpt.
- A caller relied on `0` being skipped (search usages:
  `grep -rn "calculateTotalAreaTime" packages apps --include=*.ts --include=*.tsx`)
  — if any caller comments or logic treats a 0 input as "no area," report before
  changing behavior.

## Maintenance notes

- This is the canonical "falsy-vs-nullish" trap. If other scoring helpers in
  this file or package use `if (someNumber)` on a `number | null` value, they
  have the same latent bug — note them in the PR for a follow-up sweep, but do
  not fix them in this plan (out of scope).
- Reviewer should confirm `!= null` (not `!== null`) so `undefined` is also
  caught.
