-- MYK9-2160: a date or venue change reaches an exhibitor whose waitlist offer is awaiting
-- payment (entry_status 'pending-payment', MYK9-1988).
--
-- show_live_entry_person_ids (MYK9-2124) is the one "who has a live entry" rule for both the
-- show_changed producer and the sender's send-time check (show_person_has_live_entry), and it
-- left 'pending-payment' out. MYK9-2125's live_entry_person_class_pairs includes it. Rather
-- than add the status to a second hand-copied list, this function now projects the pairs
-- function, so the show-level and class-level rules cannot drift apart again. Neither the
-- producer nor show_person_has_live_entry changes: both already call this function.
--
-- Rollback: re-run the show_live_entry_person_ids body from 20261117094700.

CREATE OR REPLACE FUNCTION public.show_live_entry_person_ids(p_show_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT pairs.person_id
    FROM public.live_entry_person_class_pairs(p_show_id) AS pairs;
$$;

REVOKE ALL ON FUNCTION public.show_live_entry_person_ids(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
