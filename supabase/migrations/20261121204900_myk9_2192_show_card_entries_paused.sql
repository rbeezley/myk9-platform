-- MYK9-2192: a signed-out visitor can be told card entries are paused.
--
-- can_accept_online_entry_payment (checkout's readiness check) is not granted
-- to anon, so the public show page could not tell that a club's payouts had
-- been switched off after its show was published. This adds one batched
-- answer an anonymous caller may ask: of the given show ids, the ones that are
-- publicly visible and whose club cannot take card payments right now. A
-- browse page asks once for its whole list. It returns nothing else about the
-- club or its Stripe account. Only the first 500 ids are read, so it cannot be
-- used as an unbounded scan.
--
-- The payouts question is can_accept_online_entry_payment itself, asked in the
-- platform's mode (platform_settings.stripe_livemode), the same call checkout's
-- refusal rests on, so the page and the refusal cannot disagree. The demo-club
-- exemption of the publish gate (club_publish_payouts_ok) is deliberately not
-- used: it applies to publishing only, never to checkout.

CREATE OR REPLACE FUNCTION public.shows_card_entries_paused(p_show_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
    FROM public.shows s
   WHERE s.id = ANY (p_show_ids[1:500])
     AND s.deleted_at IS NULL
     AND private.show_status_is_public(s.status)
     AND s.club_id IS NOT NULL
     AND NOT public.can_accept_online_entry_payment(
           s.club_id,
           COALESCE(
             (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true),
             false
           )
         );
$$;

COMMENT ON FUNCTION public.shows_card_entries_paused(uuid[]) IS
  'MYK9-2192: of the first 500 given ids, the publicly visible, not deleted shows whose club cannot take card payments in the platform''s Stripe mode (not can_accept_online_entry_payment). Unknown, draft and deleted ids are omitted. The one answer anon may read; exposes no club or Stripe field.';

REVOKE ALL ON FUNCTION public.shows_card_entries_paused(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shows_card_entries_paused(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.shows_card_entries_paused(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.shows_card_entries_paused(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.shows_card_entries_paused(uuid[]) TO authenticated;
