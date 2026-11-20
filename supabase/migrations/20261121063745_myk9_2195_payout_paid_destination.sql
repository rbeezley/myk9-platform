-- =============================================================================
-- MYK9-2195: the payout run records which Stripe account each transfer paid.
--
-- The payout brake's approval tally (MYK9-2171) can only say a payout "matched
-- Stripe" if the row records where Stripe sent the money. Until now a
-- reconciled transfer whose destination could not be checked was completed
-- with club_stripe_account_id left as it was, so nothing on the row told a
-- checked account from an unchecked one.
--
-- Two columns, written by cron-process-payouts wherever a transfer is recorded
-- as completed (a new send and a reconciliation from Stripe):
--
--   paid_destination_checked  true  = Stripe reported the account it paid,
--                                     held in paid_stripe_account_id
--                             false = the destination was NOT checked
--                                     (Stripe's answer carried none)
--                             NULL  = no transfer recorded with this field:
--                                     not yet sent, a $0 close-out, or a row
--                                     completed before this migration
--   paid_stripe_account_id    Stripe's account id (acct_...) as Stripe reported
--                             it; set exactly when paid_destination_checked.
--
-- The tally counts a payout as matched only when paid_destination_checked is
-- true and paid_stripe_account_id equals approved_stripe_account_id. Unchecked
-- and unrecorded never count.
--
-- club_stripe_account_id keeps meaning the account the payout was meant for;
-- it is not overwritten with Stripe's destination.
--
-- No new object: the columns inherit show_payouts' table grants (authenticated
-- SELECT under show_payouts_select, service_role all). No backfill: Stripe's
-- destination for rows completed earlier is not known here, and they read as
-- not recorded.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_payouts
  ADD COLUMN IF NOT EXISTS paid_stripe_account_id text,
  ADD COLUMN IF NOT EXISTS paid_destination_checked boolean;

ALTER TABLE public.show_payouts DROP CONSTRAINT IF EXISTS show_payouts_paid_destination_shape;
ALTER TABLE public.show_payouts
  ADD CONSTRAINT show_payouts_paid_destination_shape CHECK (
    -- An account is recorded exactly when the destination was checked.
    (paid_stripe_account_id IS NOT NULL) = coalesce(paid_destination_checked, false)
    AND (paid_stripe_account_id IS NULL OR length(btrim(paid_stripe_account_id)) > 0)
    -- Only a recorded transfer says anything about its destination.
    AND (paid_destination_checked IS NULL OR stripe_transfer_id IS NOT NULL)
  );

COMMENT ON COLUMN public.show_payouts.paid_stripe_account_id IS
  'MYK9-2195: the Stripe account the transfer paid, as Stripe reported it. Set exactly when paid_destination_checked is true.';
COMMENT ON COLUMN public.show_payouts.paid_destination_checked IS
  'MYK9-2195: true when Stripe reported the account it paid (paid_stripe_account_id); false when the destination was not checked; NULL when no transfer was recorded with this field.';

NOTIFY pgrst, 'reload schema';

COMMIT;
