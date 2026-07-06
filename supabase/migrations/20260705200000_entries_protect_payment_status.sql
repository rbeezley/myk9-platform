-- Protect entries.payment_status from payout-eligible online forgery.
--
-- MP-02: show managers can legitimately mark desk payments paid, but an online
-- entry only becomes payout-eligible after the Stripe/webhook service path has
-- collected funds. This standalone trigger blocks non-service writers from
-- moving online entries into paid/refunded states while preserving desk-payment
-- updates and the service_role webhook path.
--
-- Rollback: in a follow-up migration, DROP TRIGGER
-- trg_entries_protect_payment_status ON public.entries; then DROP FUNCTION
-- public.entries_protect_payment_status();. That restores the prior behavior
-- where entries.payment_status was unguarded on update.

BEGIN;

CREATE OR REPLACE FUNCTION public.entries_protect_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT current_setting('role', true)) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF new.payment_status in ('paid', 'refunded')
     AND (
       new.payment_method = 'online'
       OR old.payment_method = 'online'
     ) THEN
    RAISE EXCEPTION
      'online entry payment_status can only be marked paid or refunded by the payment service'
      USING ERRCODE = '42501';
  END IF;

  -- Desk-payment methods remain governed by existing staff/RLS authorization.
  IF new.payment_method is distinct from 'online'
     AND old.payment_method is distinct from 'online' THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_protect_payment_status ON public.entries;

CREATE TRIGGER trg_entries_protect_payment_status
  BEFORE UPDATE OF payment_status
  ON public.entries
  FOR EACH ROW
  WHEN (new.payment_status is distinct from old.payment_status)
  EXECUTE FUNCTION public.entries_protect_payment_status();

COMMIT;
