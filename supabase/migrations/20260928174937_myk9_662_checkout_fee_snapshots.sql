-- MYK9-662: service-owned fee and identity snapshot per Stripe Session.
-- A paid webhook must not reprice from mutable DOB, show fees, or cart totals.
CREATE TABLE public.entry_checkout_fee_snapshots (
  session_id text PRIMARY KEY,
  cart_id uuid NOT NULL,
  show_id uuid NOT NULL REFERENCES public.shows(id),
  exhibitor_id uuid NOT NULL REFERENCES public.exhibitor_profiles(id),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  platform_fee_cents integer NOT NULL CHECK (platform_fee_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = subtotal_cents + platform_fee_cents),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entry_checkout_fee_snapshots_cart_idx
  ON public.entry_checkout_fee_snapshots(cart_id);
ALTER TABLE public.entry_checkout_fee_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_checkout_fee_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.entry_checkout_fee_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.entry_checkout_fee_snapshots TO service_role;
CREATE POLICY entry_checkout_fee_snapshots_deny_clients
  ON public.entry_checkout_fee_snapshots FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
