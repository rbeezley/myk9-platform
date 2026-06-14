# 07 Targeted Test Coverage Gaps

Finder: subagent `019eb9d5-8aab-78a3-b4ff-2eeda8bd6bcd`
Status: Phase 1 inventory complete; initial Phase 2 verification recorded in `09-phase-2-verification.md`.

## Phase 2 Update

Confirmed P1 gaps: `calculateCartTotals`, `ScoreValidatorService`, and `PlacementCalculatorService.helpers` lack direct tests.

Correction: the server fee helper exists at `apps/myk9show/supabase/functions/_shared/platformFee.ts`; the absent path was the root `supabase/functions/_shared/platformFee.ts`.

## Findings

| Module/Test File | Gap Type | Risk Area | Severity | Evidence | Verification | Proposed Test | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/myk9show/src/store/cartStore.helpers.ts` | Missing direct unit test | Fee calculation / Stripe total drift | P1 | `calculateCartTotals` has rounding comment for 350 cents -> 25 cents; no direct test imports found; server helper exists at `apps/myk9show/supabase/functions/_shared/platformFee.ts`. | Phase-2 confirmed | Add `cartStore.helpers.test.ts` covering empty cart, multi-item subtotal, 350-cent half-cent boundary, label percent, and parity with server helper. | The missing path was root `supabase/functions/_shared/platformFee.ts`. |
| `apps/myk9show/src/services/scoring/ScoreValidatorService.ts` | Complex exported service with no direct test | Scoring validation / judge flow | P1 | 475 lines, exported service, about 60 branch hits; no test references. Rules include too-fast warnings, future timestamps, missing Q data, absent-with-score warnings. | Phase-2 confirmed | Unit-test `validateScore`, `validateRealTime`, `validateScores`, custom rules, unsupported format, future timestamps, Q/NQ consistency. | Existing scoring tests cover page mapping/UI, not this validator. |
| `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.ts` | Complex pure helpers with no direct test | Scoring math / placements / ties | P1 | 13 exported helpers, about 61 branch hits; no tests for placement/tie helpers. | Phase-2 confirmed | Table-driven tests for scent work sorting, ties, tie breaker priority, placement gaps, serialization date round-trip. | Existing UI placement test covers a smaller helper. |
| `bulk-result-entry/helpers.ts` and `bulk-result-entry-utils.ts` | Duplicate untested pure logic | Show-day secretary bulk scoring | P2 | Both export time formatting/conversion/validation helpers; no tests found. | Phase-2 confirmed | Consolidate to one helper, then test time conversions and validation edge cases. | Also belongs in duplication audit; test after consolidation. |
| `showCreationWizardValidation.ts` | Complex pure validation with no direct test | Secretary setup flow | P2 | 4 exported validation functions, branchy date/event-number rules; no test imports found. | Phase-2 confirmed | Test required fields, ISO datetime date-part normalization, entry close after start, AKC event number required, non-AKC not required, per-trial messages. | Secretary launch-readiness path. |
| `showCreationWizardTransformers.ts` | Partial/indirect coverage only | Secretary setup data integrity | P2 | Tests only import wizard types; logic maps trial IDs, edit modes, class fees, judges, clubs. | Phase-2 confirmed | Test trial ID mapping, class data fee fallback/existing-trial filtering, show transform club/judge fallbacks. | Use deterministic UUID/date mocks. |
| `apps/myk9show/src/services/entries/EntryValidator.ts` | Partial coverage misses full validator | Entry eligibility / fee mismatch / offline validation | P2 | Existing tests call only `validateCompetitionData`; no `validateEntry(` test calls found. | Phase-2 confirmed partial coverage | Full-context tests: valid entry, fee mismatch warning, closed show error, deadline warning/error, breed/height/handler restrictions. | Highest-risk path inside module is uncovered. |
| `conflictSurfacingFlag.ts` and `packages/replication/src/conflictConfig.ts` | Direct flag semantics not pinned | Replication conflict surfacing | P2 | Conflict algorithms have tests, but flag modules do not. Config default is true; env `false` can override; package default false until configured. | Phase-2 confirmed, refined | Unit tests for env precedence, feature default, `configureConflictSurfacing`, reset helper, and provider boot. | Not a conflict resolver algorithm gap. |
| `apps/myk9show/src/**/*.test.tsx` raw `render` imports | Test convention drift | Test reliability | P3 | 215 files import `render` from `@testing-library/react`; project convention says use `src/test/utils/testUtils.tsx`. | confirmed static | Prioritize routed/query/auth component tests; leave pure presentational tests only with justification. | Avoid noisy mass conversion. |
| E2E debug/probe specs | Low-signal tests: logs/screenshots/no assertions | E2E suite signal | P3 | Heuristic found zero `expect(` calls in debug/quick/test-user specs. | confirmed static | Delete/archive debug probes or convert to assertions. | Playwright action failures provide some signal, but files read as investigation scripts. |

## Commands

Read-only commands included plan/INTENT reads, risk keyword scans, exported-functions/branch/no-nearby-test heuristics, specific `rg` checks for fee/scoring/placement/wizard/entry/conflict symbols, raw-render import count, low-signal test heuristic, and snapshot scans.
