# MYK9-423 verification — 2026-09-11

> **Status:** Active

Baseline: `17b4fb7a33a7650b093b7760cba0a53d6670cf2d`.
Branch: `codex/myk9-423-payment-proof`.
Tracking: [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423).

## Result

The missing fee-card-to-cart regression is implemented and passes. Both money surfaces also pass a real row-mapping/summary/display regression for the same entries changing from pending to paid. The historical payment remains confirmed. Fresh hosted zero-balance proof is pending because an intervening load rehearsal reseeded those exact entries to unpaid.

| Dimension          | Verdict                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness        | Real fee-card click, URL builder, router, cart store, recovery, reconciliation, line cards and summary exercised                          |
| Negative control   | Disabling empty-cart recovery fails the checkout assertion and renders “Your cart is empty”; production source restored and tests green   |
| Paid-state display | Both actual balance components clear when the original three raw rows return payment_status=paid; this is fixture-based integration proof |
| Hosted proof       | Current entries and payments both show $90; historical Sep 9 $96.30 paid receipt remains present                                          |
| Coherence          | Tests/docs only; no production implementation changed                                                                                     |
| Release            | No commit/PR/merge yet; full shuffled gate did not complete                                                                               |

## Regression evidence

`apps/myk9show/src/pages/__tests__/CartPage.feeCardRecovery.test.tsx` adds two tests:

1. Start with the real fee card quoting $90 for Ranger / Interior Advanced, Juni / Exterior Excellent and Maple / Interior Novice B. Click its real action. Use the production summary/target builder and real MemoryRouter. CartPage invokes the actual Zustand cart loader, creates its missing shell, executes real recovery and reconciliation, and renders actual CartItemCard/CartSummary components. Only PostgREST transport and unrelated identity/capacity inputs are fixtures; the real Supabase SDK builds the requests. Returned cart lines come from captured upserts rather than a prefilled store or canned loader result. Assert three exact dog/class/$30 lines, $90 fees, $96.30 total, enabled checkout and no unrelated entry.
2. Feed the same three IDs through the production raw-entry mapper and balance summary, then render the real CompactStatsRow and AmountDueSection. Assert both show $90 while pending; change only payment_status to paid and assert “Entry fees: paid in full. View your payments.”, $0.00, “Current entries are paid up.” and no Finish payment link.

Negative mutation: in the owned worktree only, replace `items.length === 0` with `items.length < 0` at the exact-entry hydration branch. The first test fails with `Unable to find role="button" and name "Pay $96.30 and confirm entries"`; its DOM contains “Your cart is empty”. A finally block restores the exact source. The restored two-file suite passes **9 tests**. This does not assert that the unchanged implementation has a current runtime defect.

## Hosted readback and reset provenance

At approximately 2026-09-11T12:49–12:51Z, an isolated signed-in exhibitor browser on `https://myk9-platform-myk9show.vercel.app` returned:

- `/exhibitor/entries`: `Entry fees: $90.00 due of $38,070.00. Finish payment.`
- `/exhibitor/payments`: Amount due $90.00; Heartland Scent Work Classic; Finish payment carries exactly entry suffixes 057, 054 and 053.
- The same payments page still lists Sep 9, 2026 / Heartland / $96.30 / Paid. Its receipt link points to order `72629930-3535-4ef3-8e7e-90504d73837b` and exactly the original three entry IDs.
- No console errors were recorded. No checkout was submitted, no remote fixture changed, and the owned session was closed.

The original canonical comment `2c55186e-1e14-4757-9c9b-ae14195d688a`, September 9 at 13:20Z, records the approved test payment `pi_3UDlOQAIej2Q9UtX2d96avum`, correct three lines, $90 + $6.30 = $96.30, success/receipt and $0 payments balance.

Later [load rehearsal 34394781017](https://github.com/rbeezley/myk9-platform/actions/runs/34394781017) successfully executed “Canonical reseed” on September 9 at 20:11:57–20:12:06Z and also completed “Always restore canonical seed”. `supabase/seed-demo.sql` explicitly recreates entries 053, 054 and 057 as submitted/pending at $30 each. The current $90 matches that later reset; it is not evidence that the earlier payment failed. It also cannot serve as a passing zero-balance readback.

## Checks

- Focused real-cart integration plus existing cart-store suite: **9/9 pass**, twice on restored production source.
- `pnpm exec tsc --noEmit -p tsconfig.test.json`: exit 0.
- Targeted ESLint: exit 0.
- Prettier and OpenSpec validation pass. Installed CLI uses `pnpm openspec validate myk9-423-payment-proof`; its documented `--change` spelling is unsupported.
- Full `pnpm exec vitest run --sequence.shuffle`, seed `1789131235677`: two unrelated `devServerWatch.test.ts` native watcher cases failed, then no output for more than 30 seconds. Stopped with exit 130 under the repository hang rule. **No full-suite pass claimed.**
- The three native watcher tests pass outside the sandbox (757ms), confirming an environment restriction. The full suite outside the sandbox (seed `1789131466371`) again stopped producing output for more than 30 seconds after a CSS parsing message, so it was stopped with exit 130. The full-suite completion gate remains blocked; no further retries.
- Initial test authoring failed because this repository's Card has no data-slot attribute; the scoped DOM lookup was corrected to its existing card class. The first negative-control wrapper inspected stdout alone, while Vitest wrote the expected failure to stderr; corrected the wrapper and confirmed the same intended failure.

## Remaining gates

- **Live proof:** one controlled Stripe test-mode checkout for the same three reset entries, followed immediately by both balance readbacks, is prepared but awaiting user approval. Do not recreate or alter shared rows to manufacture a passing result. Alternatively attach genuine preserved entries-page zero-balance evidence from the original payment if available.
- **Before pushing:** complete the required shuffled-suite gate in a suitable environment or record its unrelated blocker in the review.
- **Before archive/closure:** PR, independent review, required CI and merge evidence. MYK9-423 remains In Progress.
