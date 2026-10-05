-- =============================================================================
-- MYK9-1005 (Codex P2 on #2771): the secretary's judge-day cards read every
-- account's held spots, the secretary's own included.
--
-- The Waitlist tab's cards read get_show_class_judge_day_availability, the
-- cart's read. That read leaves out the CALLER's own holds
-- (p_exclude_auth_user_id = auth.uid(), MYK9-1012), which is right for a payer
-- and wrong for a secretary: a secretary who also has a checkout open in the
-- show sees the last spot they hold as free, offers it, and the offer is
-- refused (promote_waitlist_entry_internal counts every hold).
--
-- get_show_judge_day_capacity_for_manager(p_show_id) is the manager's read:
-- one row per confirmed judge day in the show, with
--   * capacity, taken, mail-in reserve and self-service remaining from
--     class_judge_day_capacity(..., p_exclude_auth_user_id => NULL,
--     p_count_holds => true), i.e. get_judge_day_capacity_live's figures with
--     every account's holds counted. The capacity rule is called, not copied.
--   * the judge's name, the day's classes and the dogs waiting in them, so the
--     cards need this one read instead of also reading judge_day_summary.
--
-- Gate: a site admin, someone who can manage the show, or a show official
-- (the privileged half of get_show_class_judge_day_availability's gate; the
-- public half is left out because this read counts holds for staff only).
-- Anyone else, or a deleted show, gets no rows. Counts only: no hold, cart or
-- exhibitor row reaches the client.
--
-- judge_day_summary is unchanged; the cards no longer read it.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_show_judge_day_capacity_for_manager(p_show_id uuid)
RETURNS TABLE (
  judge_id uuid,
  judge_full_name text,
  show_date date,
  class_ids uuid[],
  class_names text[],
  day_capacity integer,
  day_taken integer,
  day_mail_in_reserved integer,
  day_remaining integer,
  waitlist_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH show_classes AS (
    SELECT c.id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    WHERE t.show_id = p_show_id
      AND EXISTS (
        SELECT 1
        FROM public.shows s
        WHERE s.id = p_show_id
          AND s.deleted_at IS NULL
          AND (
            public.is_site_admin()
            OR public.can_manage_show(p_show_id)
            OR public.is_show_official(p_show_id)
          )
      )
  ),
  -- One row per (class, confirmed judge day); every row of one day carries
  -- that day's figures. NULL exclusion: every account's holds are taken.
  day_classes AS (
    SELECT
      d.judge_id,
      d.show_date,
      d.class_id,
      c.name AS class_name,
      d.day_capacity,
      d.day_taken,
      d.day_mail_in_reserved,
      d.day_remaining,
      (
        SELECT count(*)::integer
        FROM public.waitlist_entries we
        WHERE we.class_id = d.class_id
          AND we.status = 'waiting'
      ) AS waiting
    FROM public.class_judge_day_capacity(ARRAY(SELECT id FROM show_classes), NULL, true) d
    JOIN public.classes c ON c.id = d.class_id
  )
  SELECT
    dc.judge_id,
    (p.first_name || ' ') || p.last_name,
    dc.show_date,
    array_agg(dc.class_id ORDER BY dc.class_name, dc.class_id),
    array_agg(dc.class_name ORDER BY dc.class_name, dc.class_id),
    max(dc.day_capacity),
    max(dc.day_taken),
    max(dc.day_mail_in_reserved),
    max(dc.day_remaining),
    sum(dc.waiting)::integer
  FROM day_classes dc
  JOIN public.people p ON p.id = dc.judge_id
  GROUP BY dc.judge_id, p.first_name, p.last_name, dc.show_date
  ORDER BY dc.show_date, p.last_name, p.first_name, dc.judge_id;
$$;

COMMENT ON FUNCTION public.get_show_judge_day_capacity_for_manager(uuid) IS
  'MYK9-1005: the secretary''s judge-day cards. One row per confirmed judge day in the show with '
  'get_judge_day_capacity_live''s capacity, taken (EVERY account''s held spots included, the '
  'caller''s own too), mail-in reserve and self-service remaining, plus the judge''s name, the '
  'day''s classes and the dogs waiting in them. Site admin, show manager or show official only; '
  'anyone else gets no rows.';

REVOKE ALL ON FUNCTION public.get_show_judge_day_capacity_for_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_judge_day_capacity_for_manager(uuid) TO authenticated;

COMMIT;

-- A new client-callable signature: make PostgREST see it.
NOTIFY pgrst, 'reload schema';
