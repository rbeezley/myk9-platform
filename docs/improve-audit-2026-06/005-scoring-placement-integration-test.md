# Plan 005: Add an integration test pinning score → placement → exhibitor-visible rank

> **Status:** Active

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. This plan **adds tests
> only** — it must not change production scoring code. If you discover a real
> scoring bug while writing the test, STOP and report it as a separate finding;
> do not fix it inside this plan. When done, update the status row in
> `docs/improve-audit-2026-06/README.md`.
>
> **Drift check (run first)**: `git diff --stat deb820e35..HEAD -- apps/myk9show/src/services/scoring apps/myk9show/src/pages/scoring`
> If the scoring service changed since this plan was written, re-read the current
> `PlacementCalculatorService` surface before writing assertions.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (test-only)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `deb820e35`, 2026-06-21

## Why this matters

Placement calculation is the core of the platform's value: judges score entries,
and exhibitors see ranks. There is unit/mutation coverage of the placement math
(`PlacementCalculatorService.helpers.test.ts`,
`pages/scoring/__tests__/calculatePlacements.test.ts`, plus a Stryker mutation
baseline), but **no single test asserts the end-to-end contract**: given a set of
scored entries, the computed placements come out in the correct rank order with
qualifying/non-qualifying handled correctly, in the shape the results surface
consumes. A regression in the glue between the scoring math and the
placement-bearing output (sort direction, tie handling, NQ exclusion, the field
the UI reads) would slip past the existing unit tests. This plan adds one focused
integration-level test that locks that contract. It is investigative in that the
exact seam to test must be confirmed from the code first (Step 1).

## Current state

- `apps/myk9show/src/services/scoring/PlacementCalculatorService.ts` — the
  placement calculator (plus `.helpers.ts`, `.constants.ts`, `.types.ts`
  siblings). This is the unit under test.
- Existing tests to model after:
  - `apps/myk9show/src/pages/scoring/__tests__/calculatePlacements.test.ts` —
    closest existing placement test; **read it first** to learn the fixture
    shape (how entries + scores are constructed) and which function it calls.
  - `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.test.ts`
    — helper-level patterns.
- **Convention**: app tests use vitest and the custom render/util helpers in
  `src/test/utils/testUtils.tsx` where React is involved; pure-service tests call
  the service directly. App vitest runs against built package `dist`, but
  `PlacementCalculatorService` lives in the *app* (`apps/myk9show/src`), so no
  package rebuild is needed.
- **Assertion-first rule** (`CLAUDE.md`): when a value goes to a specific place,
  write the `expect(...)` first and run it red. Here, assert the exact ranks and
  Q/NQ flags before trusting the output.

## Commands you will need

| Purpose   | Command                                                                                          | Expected |
|-----------|--------------------------------------------------------------------------------------------------|----------|
| Install   | `pnpm install`                                                                                    | exit 0   |
| Read pattern | `sed -n '1,80p' apps/myk9show/src/pages/scoring/__tests__/calculatePlacements.test.ts`         | prints   |
| Run target test | `cd apps/myk9show && npx vitest run src/services/scoring/PlacementCalculatorService.integration.test.ts` | pass |
| Typecheck | `cd apps/myk9show && pnpm typecheck`                                                              | exit 0   |

## Scope

**In scope** (the only file you create):
- `apps/myk9show/src/services/scoring/PlacementCalculatorService.integration.test.ts`

**Out of scope** (do NOT touch):
- `PlacementCalculatorService.ts` and all its siblings — production code is
  frozen for this plan. If a test reveals a bug, report it; do not fix here.
- Any DB migration or trigger (e.g. `recalculate_class_placements`). This plan
  tests the *client-side* calculator service, not the SQL trigger. If the
  authoritative placement is computed in SQL and the service only displays it,
  see STOP conditions.

## Git workflow

- Branch: `advisor/005-placement-integration-test`
- Commit: `test(scoring): pin placement rank + Q/NQ contract end-to-end`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the seam to test

Read `calculatePlacements.test.ts` and `PlacementCalculatorService.ts` to
determine: (a) the entry function that takes scored entries and returns
placements (name + signature); (b) the input shape (how a scored entry, its
score, and its qualifying status are represented); (c) the output field that
carries the rank (e.g. `final_placement` / `placement`). Record these three facts
as a comment block at the top of the new test file so the test is self-documenting.

**Verify**: you can name the function, its input type, and the rank output field,
each quoting the line in `PlacementCalculatorService.ts` (or `.types.ts`) where
it is defined.

### Step 2: Write the rank-order assertion (assertion-first)

Construct a fixture of one class with 4 entries scored so the correct order is
unambiguous — e.g. three qualifying entries with distinct scores/times (clear
1st/2nd/3rd) and one non-qualifying entry. Call the function from Step 1 and
assert:
- the 1st/2nd/3rd entries get placements 1, 2, 3 in the right order;
- the NQ entry gets **no** qualifying placement (whatever the service uses to
  represent "not placed" — confirm from Step 1, do not assume `null`).

Write these `expect(...)` lines to reflect the *intended* contract and run them;
if they fail, first confirm your fixture matches the input shape from Step 1
before suspecting the service.

**Verify**: `cd apps/myk9show && npx vitest run src/services/scoring/PlacementCalculatorService.integration.test.ts`
→ all assertions pass. If an assertion fails and the fixture is correct, that is
a STOP condition (potential real bug).

### Step 3: Add the edge cases

Add cases for: a tie between two qualifying entries (assert the service's
documented tie rule — confirm it from Step 1/code, don't invent one); an
all-NQ class (no placements awarded); and an empty class (no throw, empty
result).

**Verify**: same test command → all pass; `cd apps/myk9show && pnpm typecheck`
→ exit 0.

## Test plan

- One new file
  `apps/myk9show/src/services/scoring/PlacementCalculatorService.integration.test.ts`
  with: the happy-path 4-entry rank assertion (Step 2); tie handling; all-NQ;
  empty class (Step 3).
- Model fixture construction on
  `apps/myk9show/src/pages/scoring/__tests__/calculatePlacements.test.ts`.
- Verification: `npx vitest run src/services/scoring/PlacementCalculatorService.integration.test.ts`
  → all pass; total new cases ≥ 4.

## Done criteria

ALL must hold:

- [ ] New test file exists and `npx vitest run ...integration.test.ts` passes
      with ≥ 4 cases.
- [ ] `cd apps/myk9show && pnpm typecheck` exits 0.
- [ ] No production file modified (`git status` shows only the new test file).
- [ ] `docs/improve-audit-2026-06/README.md` status row for 005 updated.

## STOP conditions

Stop and report (do not fix, do not improvise) if:

- The authoritative placement turns out to be computed by a **SQL trigger**
  (`recalculate_class_placements`) and the client service only renders a value
  the DB already set — in that case this client-only test cannot assert the true
  end-to-end contract; report that the meaningful test is a DB/integration test
  against the trigger, and stop.
- A correct fixture produces a wrong rank order or wrong Q/NQ result — that is a
  real scoring bug. Capture the failing input/output and report it as a new
  finding; do not patch the service in this plan.
- The placement function's signature/output field does not match anything you
  can find (the service was refactored since this plan) — report drift.

## Maintenance notes

- If placement logic moves from client to SQL (or vice versa), this test's seam
  assumption (Step 1) must be revisited; leave a comment in the test naming the
  function it pins so a future maintainer can find it.
- Reviewer should confirm the test asserts against the **real output field name**
  from the code, not an assumed one — that is the whole point of Step 1.
