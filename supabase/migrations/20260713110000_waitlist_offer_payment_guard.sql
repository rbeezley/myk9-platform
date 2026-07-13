-- Prevent a late Stripe-link persistence from reviving a waitlist offer that
-- declined or expired while checkout was being prepared. This applies only to
-- entries that are linked from a waitlist promotion; normal unpaid entries
-- retain the existing secretary/admin payment-link behavior.

CREATE OR REPLACE FUNCTION public.assert_active_waitlist_offer_payment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.entry_ids) AS requested(entry_id)
    JOIN public.waitlist_entries AS waitlist
      ON waitlist.promoted_entry_id = requested.entry_id
    JOIN public.entries AS entry
      ON entry.id = waitlist.promoted_entry_id
    WHERE waitlist.status IS DISTINCT FROM 'offered'
       OR waitlist.offer_expires_at IS NULL
       OR waitlist.offer_expires_at <= now()
       OR entry.entry_status NOT IN ('pending-payment', 'pending')
       OR entry.payment_status IS DISTINCT FROM 'pending'
  ) THEN
    RAISE EXCEPTION 'Waitlist offer is no longer active'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_active_waitlist_offer_payment_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entry_payment_links_require_active_waitlist_offer
  ON public.entry_payment_links;

CREATE TRIGGER trg_entry_payment_links_require_active_waitlist_offer
BEFORE INSERT OR UPDATE OF entry_ids ON public.entry_payment_links
FOR EACH ROW
EXECUTE FUNCTION public.assert_active_waitlist_offer_payment_link();

COMMENT ON FUNCTION public.assert_active_waitlist_offer_payment_link() IS
  'Rejects payment-link writes for a promoted waitlist entry once its offer is no longer active.';
