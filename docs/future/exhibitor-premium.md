# Parked: Exhibitor Premium Features

## Status
**Deferred from fall 2026 role definition.** These features were listed in the original Exhibitor duty brainstorm but struck from the fall role definition during the 2026-04-11 role-definition session.

Rationale: fall 2026 is about getting two primary roles (Secretary, Exhibitor) to a trustworthy baseline for non-computer-savvy retired users. Monetization and paid-tier features are a separate, post-fall initiative with their own scope decision.

## Parked feature list
- **Title tracking per dog** — record and display titles earned by each dog across sanctioning bodies.
- **Training journal per dog** — exhibitor notes tied to individual dogs: sessions, progress, observations.
- **Health information per dog** — vaccinations, medical history, vet contact.
- **Pedigree per dog** — sire/dam lineage with links to other dogs in the platform.
- **Advanced competition statistics per dog** — deeper analytics than the free-tier summary: trending, class-by-class breakdown, head-to-head vs other dogs, percentile rankings.

## When to revisit
After fall 2026 launch, once the free-tier Exhibitor experience has been validated with real users and the platform has reliable analytics to build on. Any premium feature work requires its own design discussion covering:
- Free vs paid boundary on each page.
- Stripe subscription plumbing and billing.
- Upsell moments and messaging.
- Whether premium is per-user or per-dog.
- Grandfathering policy for early users.

## Not in scope
Do not build any of these for fall. Do not add `// TODO premium` comments in free-tier code. Do not add feature flags for them. When in doubt, treat these features as if they live in a different application.
