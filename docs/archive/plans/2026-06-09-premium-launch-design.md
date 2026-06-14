# Premium Launch — Design (Pricing, Annual, Founding Members)

> Validated with Richard 2026-06-09 (evening session).
> Companion implementation plan: [2026-06-09-premium-launch-implementation.md](2026-06-09-premium-launch-implementation.md)
> Status of prior docs: [2026-02-24-phase2-exhibitor-platform-premium-design.md](2026-02-24-phase2-exhibitor-platform-premium-design.md)
> is **SHIPPED** (see audit below); the Feb roadmap's gap list is stale.

## Audit verdict (2026-06-09): the February design is built

Full-code audit against the Feb 24 design and the Feb 21 roadmap:

| Capability | State | Where |
| --- | --- | --- |
| Tier resolution + gating | SHIPPED | `useSubscriptionGate` reads `exhibitor_profiles.subscription_tier`, enforces `subscription_expires_at`, feeds `BlurGate` |
| Title tracking engine | SHIPPED | `src/services/titleEngine.ts` — rule-driven, reads `sport_titles` + platform results + `manual_results` |
| Manual historical results | SHIPPED | migration 042 + CRUD + premium-gated UI |
| Health records | SHIPPED | tables (vaccinations, screenings, meds, vet visits), CRUD, timeline UI |
| Training journal | SHIPPED | migration 041 (+milestones, goals), CRUD, UI |
| Pedigree | SHIPPED | migration 043 `pedigree_ancestors` (3-gen), CRUD, UI |
| Performance statistics | SHIPPED | `PerformanceStatisticsSection`, stats cards |
| Results log (free tier) | SHIPPED | `useExhibitorResults` on `view_entry_with_results` (live data) |
| Pricing/Subscription pages | SHIPPED | `/pricing-page` ($4.99/mo, live price id), `/subscription` portal |
| Webhook tier sync | SHIPPED | `syncSubscriptionFromStripe` writes tier + expiry; columns protected (migrations 109/110) |
| AskQ tier awareness | SHIPPED | premium rate-limit headroom, free upgrade link |
| Shows-based trial | SHIPPED (bonus) | first 3 scored shows behave as premium (`TRIAL_SHOW_LIMIT`) |
| Founding-member flag | SHIPPED, semantics changing | `people.is_early_adopter` (migrations 185/186) grants premium **for life**; decision below converts to 12 months |

The roadmap's claims (FeatureGate unwired, tier never flows, naming mismatch,
shells without persistence) were all resolved between February and May.

## Decisions (2026-06-09)

1. **Price stays $4.99/month** for launch. Repricing waits for real conversion
   data; raising on new subscribers later is easy.
2. **Add an annual plan at ~$49/year** (two months free). Mostly Stripe
   dashboard work + a price-mapping change.
3. **Founding member = 12 months free premium**, replacing the current
   premium-for-life semantics of `is_early_adopter` (decided with awareness of
   migration 185's "retained permanently" comment — pre-launch, nobody has been
   promised forever yet, so the schema docs change with it).
4. **`pro` tier stays a reserved DB value** — no code knows it; no work.

## Design

### Founding member mechanism

Replace the boolean's open-ended grant with an expiring one (pre-launch, no
compat shim needed):

- `people.early_adopter_until TIMESTAMPTZ NULL` — non-null and in the future ⇒
  premium. Migration backfills `now() + 12 months` for any row with
  `is_early_adopter = true`, then drops the boolean; the protect-trigger from
  migration 186 moves to the new column.
- `useSubscriptionGate`: `isEarlyAdopter` becomes "has a future
  `early_adopter_until`" — expiry then behaves identically to paid-premium
  expiry the hook already enforces.
- Granting stays a manual, site-admin act (Supabase dashboard / SQL), documented
  in the operations runbook. The SubscriptionPage shows "Founding member —
  premium until <date>" so the user always knows where they stand.

### Annual plan

- New Stripe prices: sandbox + (at go-live) live mode, ~$49/yr.
- PricingPage gets a monthly/annual toggle; checkout passes the chosen price id.
- `mapPriceToTier` in the webhook stops hardcoding price ids (see below).

### Price configuration (fixes the sandbox break)

The live price id is hardcoded in `stripe-config.ts` and in the webhook's
`mapPriceToTier`, which is why staging's premium checkout broke when staging
moved to sandbox keys (Phase 0). Fix:

- Frontend: `VITE_STRIPE_PRICE_MONTHLY` / `VITE_STRIPE_PRICE_ANNUAL` env vars
  with the current live ids as fallbacks.
- Webhook: `PREMIUM_PRICE_IDS` secret (comma-separated) consulted by
  `mapPriceToTier`; unknown ids still map to free.
- Sandbox gets its own product + two prices (5-minute Workbench shell task).

### Out of scope

Repricing experiments, team/club subscriptions, the `pro` tier, AskQ limit
tuning, and any new premium features. The premium feature set is complete;
this plan only launches it properly.
