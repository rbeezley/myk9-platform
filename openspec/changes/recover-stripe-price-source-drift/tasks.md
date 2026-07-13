## 1. Source Recovery Evidence

- [x] 1.1 Compare the recovered deployed helper fingerprint and replacement behavior with current
      repository `premiumPrices.ts`; record the selected fallback-extension source of truth and why
      it is safer.
- [x] 1.2 Confirm the colocated pure-helper test proves a sandbox-only configured set preserves
      fallback live IDs; add an assertion-first regression test only if that contract is not already
      covered.

## 2. Operational Contract And Tracking

- [x] 2.1 Update the Edge Function drift audit with the reviewed source decision, exact focused
      test evidence, separate approved deployment command, post-deploy comparison, and rollback
      boundary.
- [x] 2.2 Update Phase 0.4 / Stripe cutover tracking to mark source recovery prepared while keeping
      `stripe-upgrade-subscription`, the four-function catch-up batch, and all Stripe operator
      actions explicitly open.

## 3. Verification And Review Gate

- [x] 3.1 Run the focused `premiumPrices` Vitest contract, `pnpm openspec validate
      recover-stripe-price-source-drift --type change --strict`, and `git diff --check`.
- [x] 3.2 Run implementation verification against the OpenSpec artifacts; fix critical or
      straightforward warning findings and rerun affected checks.
- [ ] 3.3 Commit the recovery slice, create a reviewed PR only after explicit confirmation, and
      wait for CI/review before merge. Do not deploy any Edge Function from this change without a
      separate explicit approval.
