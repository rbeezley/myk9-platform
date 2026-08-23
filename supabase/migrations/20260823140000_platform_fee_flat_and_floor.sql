-- MYK9-197 — platform fee gains a flat per-checkout component and a floor.
--
-- The fee was a pure percentage of the cart subtotal while Stripe's cost is
-- percentage + a flat 30¢ per TRANSACTION. Because the flat cost is per
-- checkout and the fee was per dollar, the platform's effective take rate moved
-- with how many entries an exhibitor happened to put in one cart (2.70% at one
-- entry vs 3.76% at nine, on a $25 entry) — a variable the pricing model never
-- intended to be sensitive to. The payment-request path is frequently a
-- single entry, so it was disproportionately exposed.
--
-- The fee expression becomes:
--   fee = max(round(subtotal * percent / 100) + flat_cents, min_cents)
--
--   platform_fee_flat_cents  charged ONCE PER CHECKOUT. Recovers exactly the
--                            cost that varies and removes the cart-size
--                            dependency (net per entry lands ~$0.97 at every
--                            cart size).
--   platform_fee_min_cents   a floor for CHEAP ENTRIES, not small carts. At 7%
--                            it only binds below a $14.29 subtotal, so it does
--                            nothing at a typical $25 entry — it guards fun
--                            matches and single cheap classes.
--
-- BOTH DEFAULT TO 0, deliberately. At 0/0 the expression collapses to exactly
-- the percentage-only math that shipped before, so this migration is inert on
-- arrival and the setting itself is the kill switch: nobody is charged a cent
-- more until a site admin sets a value on /admin/payouts. Do NOT seed non-zero
-- values here.
--
-- Grants: platform_settings holds TABLE-level `GRANT SELECT, UPDATE ... TO
-- authenticated` (20260615180000, recodified 20260730220000) and no
-- column-level ACLs, so new columns inherit the existing surface with no
-- further grant. anon is covered by the blanket `REVOKE ALL ON TABLE
-- public.platform_settings FROM anon` in 20260730220000 and stays excluded;
-- the anon default-privileges trap applies to CREATE TABLE, not ADD COLUMN.
-- The site-admin write guard (trg_guard_platform_settings_write) already
-- covers every column of every UPDATE.

begin;

alter table public.platform_settings
  add column if not exists platform_fee_flat_cents integer not null default 0,
  add column if not exists platform_fee_min_cents integer not null default 0;

-- Sanity rails on an operator typo, not a pricing opinion: 500¢ is well above
-- Stripe's 30¢ and 2000¢ is above any plausible entry fee. Mirrored by
-- PLATFORM_FEE_LIMITS in supabase/functions/_shared/platformFee.ts and by the
-- admin surface on /admin/payouts.
alter table public.platform_settings
  drop constraint if exists platform_settings_flat_cents_range;
alter table public.platform_settings
  add constraint platform_settings_flat_cents_range
  check (platform_fee_flat_cents >= 0 and platform_fee_flat_cents <= 500);

alter table public.platform_settings
  drop constraint if exists platform_settings_min_cents_range;
alter table public.platform_settings
  add constraint platform_settings_min_cents_range
  check (platform_fee_min_cents >= 0 and platform_fee_min_cents <= 2000);

comment on column public.platform_settings.platform_fee_flat_cents is
  'Flat platform fee component charged once per checkout, in cents. 0 = off (default). Mirrors Stripe''s per-transaction flat cost so the take rate does not depend on cart size (MYK9-197).';

comment on column public.platform_settings.platform_fee_min_cents is
  'Minimum total platform fee per checkout, in cents, applied only when the subtotal is positive. 0 = off (default). Guards cheap entries, not small carts (MYK9-197).';

comment on table public.platform_settings is
  'Single-row operator config (id=true). The platform fee is max(round(subtotal * platform_fee_percent / 100) + platform_fee_flat_cents, platform_fee_min_cents), read by stripe-checkout / stripe-payment-link and mirrored by the cart preview.';

commit;
