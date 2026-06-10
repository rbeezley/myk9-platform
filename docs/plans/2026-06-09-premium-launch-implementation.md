# Premium Launch — Implementation Plan

> **Progress 2026-06-09 (late session):** Tasks 1 + 2 code ✅ COMPLETE, pushed +
> deployed (early_adopter_until live, boolean dropped — verified via REST;
> protect trigger fixed to admit postgres/service_role after the auditor showed
> 186's version silently blocked dashboard grants; PREMIUM_PRICE_IDS mapping
> deployed with live fallback). Known transient: staging's deployed frontend
> fails profile loads until this branch merges (pre-launch, accepted).
> Remaining: Richard's sandbox product/prices + secrets (Task 2 tail), Task 3
> annual toggle, Task 4 verification — fold into the Phase 6 sitting. Post-merge
> follow-up: regenerate Supabase TS types (drops is_early_adopter, adds new
> payment tables/columns — clears the untypedFrom/`as unknown` bridges).

> **For Claude:** small plan (~1 day). Design (read first):
> [2026-06-09-premium-launch-design.md](2026-06-09-premium-launch-design.md).
> Conventions identical to the Connect plan: red-first tests on anything
> value-bearing, migration-auditor before push, confirm with Richard before
> `db push` / `functions deploy` / Stripe dashboard changes.

## Task 1 — Founding member: 12-month expiry

**Files:**
- Create: `supabase/migrations/<timestamp>_early_adopter_expiry.sql`
- Modify: `apps/myk9show/src/hooks/useSubscriptionGate.ts` + its test
- Modify: `apps/myk9show/src/hooks/useExhibitorProfile.ts` (surface the new column)
- Modify: `apps/myk9show/src/pages/SubscriptionPage.tsx` (founding-member line with date)
- Modify: `docs/operations/stripe-platform-setup.md` (grant procedure section)

Migration: add `people.early_adopter_until TIMESTAMPTZ`; backfill
`now() + interval '12 months'` where `is_early_adopter`; port migration 186's
write-protection to the new column; drop `is_early_adopter` (pre-launch, no
shim); update column comment to the 12-month promise. Audit with
migration-auditor (write-protection parity is the thing to verify), confirm,
push.

Hook (test first, red): `isEarlyAdopter = early_adopter_until != null && new
Date(early_adopter_until) > now`. Existing test file
`useSubscriptionGate.test.ts` covers the flag — update cases: future date ⇒
premium, past date ⇒ free, null ⇒ free, interplay with paid tier unchanged.

## Task 2 — Env-driven price config (fixes staging checkout)

**Files:**
- Modify: `apps/myk9show/src/stripe-config.ts` (env with live fallback)
- Modify: `apps/myk9show/supabase/functions/stripe-webhook/index.ts`
  (`mapPriceToTier` reads `PREMIUM_PRICE_IDS` secret, comma-separated; keep
  current ids as fallback)
- Extract + test (red first): pure `parsePremiumPriceIds(env)` /
  `priceIdToTier(priceId, premiumIds)` in `_shared/` per the established pattern.

Richard (5 min, Workbench shell in sandbox):
```
stripe products create -d name="myK9Show Premium"
stripe prices create -d product=<prod_id> -d unit_amount=499 -d currency=usd -d "recurring[interval]=month"
stripe prices create -d product=<prod_id> -d unit_amount=4900 -d currency=usd -d "recurring[interval]=year"
```
Then: `supabase secrets set PREMIUM_PRICE_IDS=<both sandbox ids>` and the two
`VITE_STRIPE_PRICE_*` values in the Vercel env (staging). Live ids join the
list at go-live.

## Task 3 — Annual plan UI

**Files:**
- Modify: `apps/myk9show/src/pages/PricingPage.tsx` (monthly/annual toggle,
  "$49/yr — 2 months free" framing) + component test
- Verify: `stripe-upgrade-subscription` handles a monthly→annual price change
  (read it; if it hardcodes the price id, parameterize like Task 2)

## Task 4 — Verification + docs sync

1. Sandbox paywall walkthrough (fold into the Phase 6 sitting): subscribe with
   4242 via the new toggle (both intervals), confirm tier flips premium in-app,
   cancel via portal, confirm downgrade-at-expiry; grant a founding member and
   watch the badge + expiry.
2. Status banners: mark the Feb 24 design doc SHIPPED (pointer here); mark the
   Feb 21 roadmap's gap table stale (audit table here supersedes).
3. `OPEN-TODOS.md` sync; memory update.

## Out of scope

Everything in the design's out-of-scope list. No new premium features.
