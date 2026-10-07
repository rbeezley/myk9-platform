# Secretary day completion

## Why

Three remaining gaps make a secretary's show day harder: withdrawn dogs lose their armband at ringside, AKC combined awards require manual calculation, and one judge's daily capacity cannot be changed in the app. Tracking: MYK9-977, MYK9-973, MYK9-1016. Original request: “can you pick up 3 more issues from Linear that can be finished.” Implementation authorized by “proceed”.

## What Changes

- Resolve ringside and check-in armbands through the existing shared resolver and a show-scoped offline replica.
- Add High Combined Division to the existing AKC High in Trial report, using verified Chapter 6 §§8–10 rules and updating the guide.
- Set, change and clear one judge-day's capacity on its existing waitlist card, consistently across its assignments, with authoritative availability refreshed.

Does this duplicate an existing page? No. Each change extends its canonical surface; a link cannot supply the missing data or calculation. No new page, report picker, assignment screen, automatic award decision, payment flow or capacity formula is introduced.

## Capabilities

### New Capabilities

- `ringside-armband-resolution`: cached show-scoped armband fallback for all ringside entries.
- `akc-combined-awards`: High Combined Division eligibility, ranking and truthful provisional presentation in the existing report.

### Modified Capabilities

- `entry-capacity-enforcement`: manager-set judge-day limits with consistent assignment values and unchanged source-aware enforcement.

## Impact

myK9Show ringside adapter, armband replication, check-in reader, HIT engine/report/guide, waitlist capacity cards and a manager capacity mutation. No shared-system writes or deployment are part of implementation authorization. Split delivery if the new capacity write requires a migration/security boundary that deserves independent review.
