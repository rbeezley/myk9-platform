# MYK9-423 payment proof

> **Status:** Active

## Original request

fix **MYK9-423:** Complete proof that the fee-card action loads the correct cart and both balances clear after payment. Payment itself already passed.

Tracking: [MYK9-423](https://linear.app/myk9-platform/issue/MYK9-423).

## Why

Fall 2026 payment readiness needs a regression that proves the actual fee-card navigation and cart hydration compose correctly. The existing direct-URL test mocks the loader; the recorded successful payment lacks an explicit entries-page fee-card readback.

## What Changes

- Add a fee-card-to-cart component integration test using the real router, cart store, recovery and cart presentation, with deterministic database transport fixtures.
- Prove an empty-hydration mutation fails the rendered-item/total assertions.
- Record read-only hosted proof for both balance pages and retain the September 9 successful same-entry payment evidence.

## Capabilities

No behavior or capability changes. `skip_specs: true`: this change strengthens verification of the existing MYK9-423 contract.

## Impact

Tests and proof artifacts only. Existing `CompactStatsRow`, payment target builder, `CartPage`, cart recovery and money surfaces are reused. No surface is duplicated; existing navigation is exercised. Non-goals: payment replay, production data writes, checkout changes, new UI, migrations and unrelated findings.
