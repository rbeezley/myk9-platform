# Authoritative entry payment settlement

## Why

Stripe entry payment settlement currently spans edge-function reads, capacity writes, entry money stamps, and order creation. A retry or concurrent move-up can observe different source rows between those writes, while caller-provided entry IDs can diverge from the persisted cart or payment-link line set.

## Scope

Add one service-only SQL transaction boundary that consumes a persisted cart or payment link, exact verified Stripe line-price evidence, and fresh verified Session/PaymentIntent/gross facts. Resolve source membership, money roots, and current live entries from locked database rows. Persist payment-link entry fee snapshots at issuance. Keep Stripe refund API calls outside the transaction.

## Non-goals

No second TypeScript lineage implementation, no changes to refund decision rules, no new client page, and no deployment or shared database mutation.

## Compatibility and rollout

The edge-function cutover must ensure new payment links persist the immutable per-entry price snapshot and new Checkout Sessions carry exact source-line identifiers before they are handled by this RPC. Legacy open links have no durable per-line snapshot; existing sessions also lack the new cart line identifiers. SQL refuses those ambiguous settlements rather than reconstructing a price from mutable entry state. A paid legacy session requires the established full-refund/manual recovery. This change does not expire or cancel existing sessions, and does not authorize a guessed backfill.

## Acceptance

- Missing, extra, duplicate, or repriced Stripe lines fail before writes.
- Caller supplied money-root/live IDs cannot influence order attribution.
- Cart recovery creates each accepted entry through `create_online_paid_entry` in the same transaction.
- Payment-link roots and full move-up descendants are derived under stable row locks; only one valid same-show/same-dog live leaf is accepted.
- Accepted existing live entries and their linked offered/eligible expired waitlist rows advance atomically with the root money stamp.
- Source consumption, money stamps, succeeded canonical order, and expected make-whole snapshot commit or roll back together.
- Same-session retries return the stored result; another PaymentIntent on a consumed source is rejected.
- Existing capacity/waitlist behavior remains authoritative and all gross, entry subtotal, platform fee, processing fee, and expected make-whole amounts remain auditable.
