-- =============================================================================
-- Migration: entry_payment_links
-- =============================================================================
-- Persisted secretary-initiated payment links for UNPAID entries (mail-in card
-- requests + waitlist pay-to-claim). Backs the `stripe-payment-link` edge fn.
--
-- Purpose:
--   1. Let the webhook reconcile a paid link back to its exact entries.
--   2. Let a re-request EXPIRE the prior open link so two live links can't both
--      be paid (no double-charge).
--   3. Power the "link sent / unpaid / expired" indicator on secretary surfaces.
--
-- Charges land in the PLATFORM account (hold-and-transfer); this table holds no
-- money, only the link lifecycle. Writes are service-role only (the edge fn);
-- authenticated secretaries/admins may READ their show's links for status UI.

CREATE TABLE IF NOT EXISTS public.entry_payment_links (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id                     uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  entry_ids                   uuid[] NOT NULL,
  stripe_checkout_session_id  text NOT NULL UNIQUE,
  status                      text NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'paid', 'expired', 'canceled')),
  amount_cents                integer NOT NULL,
  created_by                  uuid,  -- auth.users id of the issuing secretary/admin
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_payment_links_show_idx
  ON public.entry_payment_links (show_id);

-- Fast "is there an open link for this show?" + the re-request expiry sweep.
CREATE INDEX IF NOT EXISTS entry_payment_links_open_idx
  ON public.entry_payment_links (status)
  WHERE status = 'open';

-- "find open links overlapping these entry ids" (re-request expiry uses &&).
CREATE INDEX IF NOT EXISTS entry_payment_links_entry_ids_idx
  ON public.entry_payment_links USING GIN (entry_ids);

ALTER TABLE public.entry_payment_links ENABLE ROW LEVEL SECURITY;

-- Read-only for the show's secretary, the club's admin, or a site admin — for
-- the status indicator. No client INSERT/UPDATE/DELETE policy: only the
-- service-role edge function writes (it bypasses RLS).
CREATE POLICY entry_payment_links_select ON public.entry_payment_links
  FOR SELECT
  TO authenticated
  -- (SELECT fn()) wrappers = the repo's InitPlan-promotion idiom; prevents the
  -- authz functions re-evaluating per row (O(N) policy anti-pattern).
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.is_show_secretary(show_id))
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = entry_payment_links.show_id
        AND s.club_id IS NOT NULL
        AND (SELECT public.is_club_admin(s.club_id))
    )
  );

-- As of 2026-10-30 new public tables are not auto-exposed to the Data API; grant
-- explicitly. Read-only for authenticated; service_role bypasses RLS for writes.
-- No anon access (these links are secretary-facing; the payer uses the Stripe URL).
GRANT SELECT ON public.entry_payment_links TO authenticated;

COMMENT ON TABLE public.entry_payment_links IS
  'Lifecycle of secretary-initiated Stripe payment links for unpaid entries '
  '(mail-in + waitlist pay-to-claim). Service-role writes; secretary/admin reads.';
