# Shipped: Exhibitor Premium Features

## Status

**Shipped.** These features were originally parked post-fall-2026 (see git history for the prior "Deferred" version of this doc) and have since been built and released as the myK9Show Premium tier ($4.99/mo, with a founding-member 12-month discount).

## Shipped feature list

- **Title Progress** — titles earned by each dog across sanctioning bodies.
- **Training Journal** — exhibitor notes tied to individual dogs: sessions, progress, observations.
- **Health Records** — vaccinations, medical history, vet contact.
- **Pedigree** — sire/dam lineage with links to other dogs in the platform.
- **Statistics** — per-dog competition statistics.

An additional **Analytics** capability (scored-show trial insights) is scoped separately from the five capabilities above — it is gated on its own trial, not the general Premium grant.

## Admin grant workflow

Complimentary/founding Premium access is administered as durable `subscription_entitlement_grants` rows, managed from User Management's `UserEditPanel` via admin RPCs (grant / revoke / explicit-replace with reason + history). This replaced ad hoc `early_adopter_until` misuse (PR #1439/#1442, MYK9-75).

## Not in scope

Free vs paid boundary, billing, and upsell messaging live in the `@/features/entitlement` gate (`useSubscriptionGate`) and the Subscription/Pricing pages — see those surfaces for current behavior rather than duplicating it here.
