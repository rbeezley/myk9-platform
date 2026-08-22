## Verification Report: myk9-226-cart-capacity-reproduction

### Summary

| Dimension | Status |
| --- | --- |
| Completeness | 9/11 tasks complete; two coordinator/shared-system gates remain |
| Correctness | Source-level conclusion supported by route inventory, predicate parity, history, and 6× focused tests; hosted real-flow proof remains open |
| Coherence | Followed the reproduction-first, no-charge design; no production code changed |

### Reproduction result

**Current `origin/main` is fail-closed in source and page-level orchestration tests, but MYK9-226 is not yet closed because the required hosted real-flow attempt has not been recorded.**

- The wizard's card path persists the selected lines and navigates to the existing `/cart` surface.
- Cart hydration selects `classes.allow_waitlist` (`cartStore.ts:86-91`).
- The cart blocks unresolved capacity and performs a fresh query at submit (`CartPage.tsx:223-279`).
- A full line whose wait-list flag is false, NULL, or missing is classified `blocked` (`cartCapacitySplit.ts:32-49`).
- The blocked branch returns before both cart submission and Stripe handoff (`CartPage.tsx:280-294`).
- The exact page-level test asserts the user-facing denial and that neither boundary is called (`CartPage.splitCheckout.test.tsx:370-381`). This test mocks cart, capacity, database, and Stripe boundaries, so it is supporting evidence rather than the issue's required real-flow proof.
- A separate test covers a tab that rendered with room and then receives zero spots from the submit-time refresh (`CartPage.splitCheckout.test.tsx:440-491`).

### Historical explanation

The four recorded carts were paid on 2026-08-18. Git history shows the decisive submit-time capacity refresh landed on 2026-08-20 in PR #1700 / commit `f1de06424`. MYK9-173's August 4 change aligned the rendered capacity and NULL wait-list semantics, but it still trusted the render-time query snapshot. The August events therefore match the stale-snapshot race fixed two days later; they do not demonstrate a current defect.

### Client/server predicate parity

- Confirmed assignment scope: client `useJudgeDayCapacity.ts:65-70`; server `supabase/migrations/20260712200000_entry_capacity_enforcement.sql:57-65,213-220`.
- Active entry statuses and soft-delete exclusion: client `useJudgeDayCapacity.ts:100-113`; server `supabase/migrations/20260712200000_entry_capacity_enforcement.sql:108-113,200-207`.
- Per-class maximum: client `useJudgeDayCapacity.ts:90-129`; server `supabase/migrations/20260712200000_entry_capacity_enforcement.sql:181-210`.
- Judge-day maximum and mail-in reserve: client `useJudgeDayCapacity.ts:132-154`; server `supabase/migrations/20260712200000_entry_capacity_enforcement.sql:93-127,226-245`.
- No-waitlist denial: client `allow_waitlist !== true` at `cartCapacitySplit.ts:40-48`; server `COALESCE(..., false)` and denial at `supabase/migrations/20260712200000_entry_capacity_enforcement.sql:181-185,266-272`.

### Verification commands

- Focused Vitest set from `apps/myk9show`: seeds 226–231, **6/6 runs passed**, 27 tests per run (162 total assertions/test cases executed).
- `pnpm openspec validate myk9-226-cart-capacity-reproduction`: passed.
- `git diff --check`: passed.
- App typecheck and lint were started, but each produced no terminal progress for 60 seconds and was stopped per the repository's known-runner rule. No TypeScript or production source changed, so this does not weaken the focused reproduction result.
- The initial monorepo-root Vitest invocation failed to resolve the app `@/` alias; rerunning from `apps/myk9show` passed. This was a command-scope/configuration error, not a product failure.

### CRITICAL

- Coordinator gate 4.1 is incomplete: record a hosted browser attempt through actual wizard/cart hydration, stopping before Stripe. Creating and cleaning a disposable shared cart fixture requires a separate shared-database mutation approval.
- Coordinator gate 4.2 is incomplete: with approval, update the backlog plan and archive/push tracking artifacts.

### WARNING

- App-wide typecheck/lint did not finish within the 60-second local limit. Recommendation: rely on the 6× focused tests for this evidence-only change; if a PR is later opened, CI is authoritative.

### SUGGESTION

- If intentional QA continues to create direct Stripe sessions, track test-mode alert filtering separately. Do not downgrade the paid-with-no-service event itself.

### Final Assessment

No production change is justified by the source-level evidence collected so far. The historical incidents predate the already-merged submit-time refresh, but the Linear issue remains open until hosted real-flow proof confirms the deployed wizard/cart path. Keep the server denial, refund, and error alert as defense in depth; do not archive this change yet.
