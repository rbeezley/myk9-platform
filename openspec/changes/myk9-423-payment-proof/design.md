# Payment proof design

> **Status:** Active

## Context

See proposal.md and MYK9-423's original AC1–AC4. Existing payment comment `2c55186e-1e14-4757-9c9b-ae14195d688a` supplies successful three-entry payment evidence.

## Goals / Non-Goals

Exercise `CompactStatsRow` with the production payment-target builder, real router, `CartPage`, `useCartStore.loadActiveCart`, recovery/reconciliation, `CartItemCard` and `CartSummary`. Assert exactly the named lines, quoted $90 fees and $96.30 checkout total. No changes to production behavior, payment processing, offline replication or role intent.

## Decisions

- Stub only database transport and unrelated identity/capacity inputs. Return cart lines from captured recovery writes, so removing hydration cannot leave a hardcoded full cart in the test.
- Begin with no cart shell and submitted unpaid entries; include an unrelated entry, an outsider entry ID in the URL, and a stale paid cart line to prove ownership filtering and reconciliation removal. Derive the fee-card target through existing payment logic.
- Use real timers and per-test fixtures. Reset the real store and transport between cases; add no module-scope mutable fixture state.
- Run the same rendered assertions against a temporary empty-hydration negative control and restore production source immediately.
- Sign in to the hosted exhibitor account in a unique owned browser session. Run one approved Stripe test checkout, then read entries and payments. Capture sanitized visible balance evidence and compare the original entry/payment identities where available. The checkout mutates only the shared staging demo fixture and is not repeated.

## Risks / Trade-offs

- Database mocks cannot prove RLS/webhooks → use the approved hosted replay and fresh balance readbacks; do not represent local integration as backend replay.
- Hosted account may have changed → identify new balances separately; never reset shared rows to fabricate the original state.
- Login or network failure → record the actual blocker and retain a pending browser gate rather than inventing proof.
- Tests can pass vacuously → assert rendered lines, amounts and absence of the empty-cart state; verify the negative mutation fails.
- Payment/PII exposure → use only the approved test card and persist only necessary sanitized evidence.

## Validation Profile

- Risk: low
- Validation: focused
- Rationale: Tests and evidence only; production payment behavior remains unchanged.

## Migration Plan

No migration or application deployment. Test-only changes go through a PR, required CI and independent review before merge/archive. A revert removes only verification artifacts; the staging fixture is restored by its normal canonical reseed process.
