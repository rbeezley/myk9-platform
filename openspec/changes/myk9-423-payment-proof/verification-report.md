# MYK9-423 verification — 2026-09-11

> **Status:** Ready for delivery

Baseline: `17b4fb7a33a7650b093b7760cba0a53d6670cf2d`.
Branch: `codex/myk9-423-payment-proof`.
Tracking: [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423).

## Result

The missing fee-card-to-cart regression is implemented and passes. Both money surfaces also pass a real row-mapping/summary/display regression for the same entries changing from pending to paid. Fresh hosted zero-balance proof is complete after one approved Stripe test checkout; the owned browser session was closed.

| Dimension          | Verdict                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness        | Real fee-card click, URL builder, router, cart store, recovery, ownership filtering, line cards and summary exercised; existing cart-store tests cover stale-line reconciliation |
| Negative control   | Disabling empty-cart recovery fails the checkout assertion and renders “Your cart is empty”; production source restored and tests green                                          |
| Paid-state display | Both actual balance components clear when the original three raw rows return payment_status=paid; this is fixture-based integration proof                                        |
| Hosted proof       | Fee-card → exact cart → approved test payment succeeded; My Shows says Paid in full and My Payments says $0.00 due                                                               |
| Coherence          | Tests/docs only; no production implementation changed                                                                                                                            |
| Release            | PR #2179 open; current-head CI and independent review are pending after the final fixture hardening; the prior full shuffled suite passed 20,039 tests |

## Regression evidence

`apps/myk9show/src/pages/__tests__/CartPage.feeCardRecovery.test.tsx` adds two tests:

1. Start with the real fee card quoting $90 for Ranger / Interior Advanced, Juni / Exterior Excellent and Maple / Interior Novice B. Click its real action. Use the production summary/target builder and real MemoryRouter. CartPage invokes the actual Zustand cart loader, creates its missing shell, executes real recovery and reconciliation, and renders actual CartItemCard/CartSummary components. Only PostgREST transport and unrelated identity/capacity inputs are fixtures; the real Supabase SDK builds the requests. Returned cart lines come from captured upserts rather than a prefilled store or canned loader result. Assert three exact dog/class/$30 lines, $90 fees, $96.30 total, enabled checkout and no unrelated entry.
2. Feed the same three IDs through the production raw-entry mapper and balance summary, then render the real CompactStatsRow and AmountDueSection. Assert both show $90 while pending; change only payment_status to paid and assert “Entry fees: paid in full. View your payments.”, $0.00, “Current entries are paid up.” and no Finish payment link.

Negative mutation: in the owned worktree only, replace `items.length === 0` with `items.length < 0` at the exact-entry hydration branch. The first test fails with `Unable to find role="button" and name "Pay $96.30 and confirm entries"`; its DOM contains “Your cart is empty”. A finally block restores the exact source. The restored two-file suite passes **9 tests**. This does not assert that the unchanged implementation has a current runtime defect.

## Hosted readback and reset provenance

At approximately 2026-09-11T19:14–19:18Z, an isolated signed-in exhibitor browser on `https://myk9-platform-myk9show.vercel.app` returned:

- `/exhibitor/entries`: the fee card initially quoted `$90.00` due and Finish Payment navigated to the exact three entry IDs.
- `/cart`: rendered Ranger / Interior Advanced, Juni / Exterior Excellent and Maple / Interior Novice B at `$30.00` each; entry fees `$90.00`, service fee `$6.30`, total `$96.30`.
- Stripe test checkout succeeded once with confirmation `pi_3UEZx0AIej2Q9UtX1EjZntVz`; the success page showed the same three entries and `$96.30`.
- `/exhibitor/entries` after settlement: `ENTRY FEES · Paid in full`.
- `/exhibitor/payments` after settlement: `Amount due · $0.00 · Current entries are paid up`; payment history shows Sep 11, 2026 / Heartland / `$96.30` / Paid.
- No browser console errors were recorded. The owned session was closed after readback.

The original canonical comment `2c55186e-1e14-4757-9c9b-ae14195d688a`, September 9 at 13:20Z, records the approved test payment `pi_3UDlOQAIej2Q9UtX2d96avum`, correct three lines, $90 + $6.30 = $96.30, success/receipt and $0 payments balance.

Later [load rehearsal 34394781017](https://github.com/rbeezley/myk9-platform/actions/runs/34394781017) successfully executed “Canonical reseed” on September 9 at 20:11:57–20:12:06Z and also completed “Always restore canonical seed”. `supabase/seed-demo.sql` explicitly recreates entries 053, 054 and 057 as submitted/pending at $30 each. The current $90 matches that later reset; it is not evidence that the earlier payment failed. It also cannot serve as a passing zero-balance readback.

## Checks

- Focused real-cart integration plus existing cart-store suite: **9/9 pass**, twice on restored production source.
- `pnpm exec tsc --noEmit -p tsconfig.test.json`: pending rerun after the final fixture typing fix.
- Targeted ESLint: exit 0.
- Prettier and OpenSpec validation pass. Installed CLI uses `pnpm openspec validate myk9-423-payment-proof`; its documented `--change` spelling is unsupported.
- Full `pnpm exec vitest run --sequence.shuffle`, seed `1789155371261`: **20,039 tests passed, 9 skipped in 434.57s**. The earlier stopped run was reporter buffering, not a test hang.
- The full shuffled suite passed on the pre-final-hardening tree; rerun it against the current head before merge.
- Initial test authoring failed because this repository's Card has no data-slot attribute; the scoped DOM lookup was corrected to its existing card class. The first negative-control wrapper inspected stdout alone, while Vitest wrote the expected failure to stderr; corrected the wrapper and confirmed the same intended failure.

## Remaining gates

- **Live proof:** complete. One controlled Stripe test-mode checkout ($96.30) was approved, succeeded, and was followed immediately by both live balance readbacks. No duplicate submission was made.
- **Before merge:** rerun typecheck and the required shuffled suite after the final fixture typing fix; then pass independent review and required CI.
- **Before archive/closure:** PR, independent review, required CI and merge evidence. MYK9-423 remains In Progress.
