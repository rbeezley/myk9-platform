-- MYK9-2192: a signed-out visitor can be told card entries are paused.
--
-- can_accept_online_entry_payment (checkout's readiness check) is not granted
-- to anon, so the public show page could not tell that a club's payouts had
-- been switched off after its show was published. This adds one show-level
-- answer an anonymous caller may ask: true when the show is publicly visible
-- and its club cannot take card payments right now. It returns nothing else
-- about the club or its Stripe account.
--
-- The payouts question is can_accept_online_entry_payment itself, asked in the
-- platform's mode (platform_settings.stripe_livemode), the same call checkout's
-- refusal rests on, so the page and the refusal cannot disagree. The demo-club
-- exemption of the publish gate (club_publish_payouts_ok) is deliberately not
-- used: it applies to publishing only, never to checkout.

CREATE OR REPLACE FUNCTION public.show_card_entries_paused(p_show_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT s.club_id IS NOT NULL
         AND NOT public.can_accept_online_entry_payment(
               s.club_id,
               COALESCE(
                 (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true),
                 false
               )
             )
        FROM public.shows s
       WHERE s.id = p_show_id
         AND s.deleted_at IS NULL
         AND private.show_status_is_public(s.status)
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.show_card_entries_paused(uuid) IS
  'MYK9-2192: true only for a publicly visible, not deleted show whose club cannot take card payments in the platform''s Stripe mode (not can_accept_online_entry_payment). False for everything else, including an unknown show. The one answer anon may read; exposes no club or Stripe field.';

REVOKE ALL ON FUNCTION public.show_card_entries_paused(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_card_entries_paused(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.show_card_entries_paused(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.show_card_entries_paused(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.show_card_entries_paused(uuid) TO authenticated;
