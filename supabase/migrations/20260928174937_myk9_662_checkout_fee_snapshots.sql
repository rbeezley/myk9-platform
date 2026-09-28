-- MYK9-662: service-owned fee and identity snapshot per Stripe Session.
-- A paid webhook must not reprice from mutable DOB, show fees, or cart totals.
CREATE TABLE public.entry_checkout_fee_snapshots (
  session_id text PRIMARY KEY,
  cart_id uuid NOT NULL,
  -- The snapshot outlives a cart, show, or profile while Stripe recovery and
  -- reconciliation may still need the exact paid price. Keep immutable IDs,
  -- without FKs that would block the existing hard-delete lifecycle.
  show_id uuid NOT NULL,
  exhibitor_id uuid NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  platform_fee_cents integer NOT NULL CHECK (platform_fee_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = subtotal_cents + platform_fee_cents),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entry_checkout_fee_snapshots_cart_idx
  ON public.entry_checkout_fee_snapshots(cart_id);
CREATE INDEX entry_checkout_fee_snapshots_created_at_idx
  ON public.entry_checkout_fee_snapshots(created_at);
ALTER TABLE public.entry_checkout_fee_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_checkout_fee_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.entry_checkout_fee_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.entry_checkout_fee_snapshots TO service_role;
CREATE POLICY entry_checkout_fee_snapshots_deny_clients
  ON public.entry_checkout_fee_snapshots FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Keep payment evidence through dispute and accounting windows, then remove
-- it after seven years even if the source show or profile has been deleted.
CREATE FUNCTION public.prune_entry_checkout_fee_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.entry_checkout_fee_snapshots
  WHERE created_at < now() - interval '7 years';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_entry_checkout_fee_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_entry_checkout_fee_snapshots() TO service_role;
SELECT cron.unschedule(jobid)
FROM cron.job WHERE jobname = 'prune-entry-checkout-fee-snapshots';
SELECT cron.schedule(
  'prune-entry-checkout-fee-snapshots', '17 4 * * *',
  'SELECT public.prune_entry_checkout_fee_snapshots()'
);
