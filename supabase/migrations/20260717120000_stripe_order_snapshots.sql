-- Immutable Stripe order financial snapshot (financial-reconciliation, MYK9-54).
--
-- Records the authoritative, cent-based facts of each online charge AT CHARGE
-- TIME so a later `platform_settings.platform_fee_percent` change never rewrites
-- historical income. The webhook populates these at every stripe_orders insert
-- site; the refund path updates ONLY refunded_cents, never the original charge
-- facts.
--
-- No historical backfill: pre-existing orders keep NULL snapshot columns and are
-- reported as rate-unverifiable / net-pending. They are intentionally NOT filled
-- from the current fee setting (doing so would rewrite history).

ALTER TABLE public.stripe_orders
  -- The paid entry service amount (excludes platform fee); NULL for legacy rows.
  ADD COLUMN IF NOT EXISTS entry_subtotal_cents integer
    CHECK (entry_subtotal_cents IS NULL OR entry_subtotal_cents >= 0),
  -- Platform fee charged, in cents, as applied at charge time.
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer
    CHECK (platform_fee_cents IS NULL OR platform_fee_cents >= 0),
  -- The fee percent applied at charge time (immutable); e.g. 7.00.
  ADD COLUMN IF NOT EXISTS platform_fee_rate numeric(5, 2)
    CHECK (platform_fee_rate IS NULL OR platform_fee_rate >= 0),
  -- Stripe's balance-transaction processing fee in cents. NULL = PENDING (the
  -- balance transaction was not yet available); it is never an estimated zero.
  ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents integer
    CHECK (stripe_processing_fee_cents IS NULL OR stripe_processing_fee_cents >= 0),
  -- Total refunded to the customer, in cents. Defaults to 0 (unrefunded); the
  -- refund path updates ONLY this column.
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0
    CHECK (refunded_cents >= 0);

-- Attention-item lookup: succeeded orders whose processing fee has not been
-- captured yet (net income pending). Partial index keeps it small — the vast
-- majority of orders have their fee resolved and are excluded.
CREATE INDEX IF NOT EXISTS idx_stripe_orders_processing_fee_pending
  ON public.stripe_orders (created_at)
  WHERE stripe_processing_fee_cents IS NULL AND status = 'succeeded';

-- Explicit grants, tightened to the real access pattern: all client code reads
-- stripe_orders only (RLS: select-own / platform-admin-manage); every write goes
-- through service_role edge functions (webhook + refund functions), which bypass
-- RLS. Grants were never declared explicitly for this table — declare them now
-- at the minimum level actually used.
REVOKE INSERT, UPDATE, DELETE ON public.stripe_orders FROM authenticated, anon;
GRANT SELECT ON public.stripe_orders TO authenticated;
GRANT ALL ON public.stripe_orders TO service_role;

-- Reversible down path (run manually to roll back — migrations are not
-- auto-reverted in this project):
--   DROP INDEX IF EXISTS public.idx_stripe_orders_processing_fee_pending;
--   ALTER TABLE public.stripe_orders
--     DROP COLUMN IF EXISTS entry_subtotal_cents,
--     DROP COLUMN IF EXISTS platform_fee_cents,
--     DROP COLUMN IF EXISTS platform_fee_rate,
--     DROP COLUMN IF EXISTS stripe_processing_fee_cents,
--     DROP COLUMN IF EXISTS refunded_cents;
