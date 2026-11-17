-- MYK9-2064: the Event Committee, entered once on the club and changeable for one show.
-- AKC Ch. 3 §15 wants an Event Committee of at least five including the Chair in the premium.
--
-- 1. club_committee_members: the club's list (Club admin > Officers > Committee). Each member is
--    either a person with an account (person_id) or a typed name (display_name), never both and
--    never neither, the same rule as club_officers (MYK9-2045). Only a club admin of that club
--    or a site admin reads or writes it.
-- 2. show_committee_members: one show's own list. When a show has rows here they REPLACE the
--    club's list for that show; no rows means the show uses the club's. The show's secretary,
--    the club admin or a site admin manages it (can_manage_show, the helper show_judge_supplies
--    uses).
-- 3. get_show_committee(show): the names for a publicly visible show, so the signed-out landing
--    page and the premium generator read one list. SECURITY DEFINER, name and sort_order only
--    (no email, no person id), with get_show_club_officers' exact gate.
-- 4. hard_delete_show is restated from its latest definition (20261114211900, MYK9-1945) with
--    one added manifest row, show_committee_members_show_id_fkey, 'disposable' (planning data,
--    not participant, money or audit evidence), so permanent deletion of a show still works.
--
-- GRANTS: default privileges here give anon full CRUD on every new table, so PUBLIC and anon are
-- revoked explicitly. Verify against pg_class.relacl after the push.

BEGIN;

CREATE TABLE public.club_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  display_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_committee_members_person_or_name_check CHECK (
    (person_id IS NOT NULL AND display_name IS NULL)
    OR (
      person_id IS NULL
      AND display_name IS NOT NULL
      AND btrim(display_name) <> ''
      AND char_length(display_name) <= 120
    )
  )
);

CREATE UNIQUE INDEX club_committee_members_person_unique
  ON public.club_committee_members (club_id, person_id)
  WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX club_committee_members_typed_name_unique
  ON public.club_committee_members (club_id, lower(btrim(display_name)))
  WHERE person_id IS NULL;
CREATE INDEX club_committee_members_club_order_idx
  ON public.club_committee_members (club_id, sort_order);
CREATE INDEX club_committee_members_person_id_fk_idx
  ON public.club_committee_members (person_id);

CREATE TRIGGER set_club_committee_members_updated_at
  BEFORE UPDATE ON public.club_committee_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.show_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  display_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT show_committee_members_show_id_fkey
    FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE,
  CONSTRAINT show_committee_members_person_or_name_check CHECK (
    (person_id IS NOT NULL AND display_name IS NULL)
    OR (
      person_id IS NULL
      AND display_name IS NOT NULL
      AND btrim(display_name) <> ''
      AND char_length(display_name) <= 120
    )
  )
);

CREATE UNIQUE INDEX show_committee_members_person_unique
  ON public.show_committee_members (show_id, person_id)
  WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX show_committee_members_typed_name_unique
  ON public.show_committee_members (show_id, lower(btrim(display_name)))
  WHERE person_id IS NULL;
CREATE INDEX show_committee_members_show_order_idx
  ON public.show_committee_members (show_id, sort_order);
CREATE INDEX show_committee_members_person_id_fk_idx
  ON public.show_committee_members (person_id);

CREATE TRIGGER set_show_committee_members_updated_at
  BEFORE UPDATE ON public.show_committee_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.club_committee_members IS
  'MYK9-2064: the club''s Event Committee. A title grants nothing. Read signed out only through get_show_committee.';
COMMENT ON TABLE public.show_committee_members IS
  'MYK9-2064: one show''s Event Committee. Rows here replace the club''s list for that show; none means use the club''s.';

ALTER TABLE public.club_committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_committee_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.show_committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_committee_members FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.club_committee_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_committee_members TO authenticated;
GRANT ALL ON public.club_committee_members TO service_role;

REVOKE ALL ON public.show_committee_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_committee_members TO authenticated;
GRANT ALL ON public.show_committee_members TO service_role;

CREATE POLICY club_committee_members_select ON public.club_committee_members
  FOR SELECT TO authenticated
  USING ((SELECT public.is_site_admin()) OR (SELECT public.is_club_admin(club_id)));

CREATE POLICY club_committee_members_insert ON public.club_committee_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_site_admin()) OR (SELECT public.is_club_admin(club_id)));

CREATE POLICY club_committee_members_update ON public.club_committee_members
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_site_admin()) OR (SELECT public.is_club_admin(club_id)))
  WITH CHECK ((SELECT public.is_site_admin()) OR (SELECT public.is_club_admin(club_id)));

CREATE POLICY club_committee_members_delete ON public.club_committee_members
  FOR DELETE TO authenticated
  USING ((SELECT public.is_site_admin()) OR (SELECT public.is_club_admin(club_id)));

CREATE POLICY show_committee_members_select ON public.show_committee_members
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_committee_members.show_id))
  );

CREATE POLICY show_committee_members_insert ON public.show_committee_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_committee_members.show_id))
  );

CREATE POLICY show_committee_members_update ON public.show_committee_members
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_committee_members.show_id))
  )
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_committee_members.show_id))
  );

CREATE POLICY show_committee_members_delete ON public.show_committee_members
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_committee_members.show_id))
  );

CREATE OR REPLACE FUNCTION public.get_show_committee(p_show_id uuid)
RETURNS TABLE ("name" text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH visible AS (
    SELECT s.id AS show_id, s.club_id AS club_id
    FROM public.shows s
    JOIN public.clubs c ON c.id = s.club_id AND c.deleted_at IS NULL
    WHERE s.id = p_show_id
      AND s.deleted_at IS NULL
      AND (
        s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        OR (SELECT public.is_club_admin(s.club_id))
        OR (SELECT public.is_show_secretary(s.id))
        OR (SELECT public.is_site_admin())
      )
  ),
  show_rows AS (
    SELECT m.id, m.person_id, m.display_name, m.sort_order, m.created_at
    FROM public.show_committee_members m
    JOIN visible v ON v.show_id = m.show_id
  ),
  chosen AS (
    SELECT r.id, r.person_id, r.display_name, r.sort_order, r.created_at FROM show_rows r
    UNION ALL
    SELECT m.id, m.person_id, m.display_name, m.sort_order, m.created_at
    FROM public.club_committee_members m
    JOIN visible v ON v.club_id = m.club_id
    WHERE NOT EXISTS (SELECT 1 FROM show_rows)
  )
  SELECT n.member_name AS "name", n.member_order AS sort_order
  FROM (
    SELECT
      COALESCE(
        NULLIF(btrim(concat_ws(' ', pe.first_name, pe.last_name)), ''),
        btrim(ch.display_name)
      ) AS member_name,
      ch.sort_order AS member_order,
      ch.created_at AS member_created,
      ch.id AS member_id
    FROM chosen ch
    LEFT JOIN public.people pe ON pe.id = ch.person_id AND pe.deleted_at IS NULL
  ) n
  WHERE n.member_name IS NOT NULL
  ORDER BY n.member_order, n.member_created, n.member_id;
$$;

REVOKE ALL ON FUNCTION public.get_show_committee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_committee(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_committee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_show_committee(uuid) TO service_role;

COMMENT ON FUNCTION public.get_show_committee(uuid) IS
  'MYK9-2064: the Event Committee names for one show, for the premium list and the public landing page. The show''s own list when it has one, else the club''s. SECURITY DEFINER with the get_show_club_officers gate, so a signed-out caller reaches only published/upcoming/in_progress/completed shows. Name and order only: no email, no person id. Do not replace with an anon policy on the committee tables.';

-- copy_club_committee_to_show: "Change for this show". One locked INSERT ... SELECT, so a second
-- tab or a double click cannot copy twice, and linked members keep their person_id.
CREATE OR REPLACE FUNCTION public.copy_club_committee_to_show(p_show_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_copied integer;
BEGIN
  IF NOT (SELECT public.can_manage_show(p_show_id)) THEN
    RAISE EXCEPTION 'not allowed to manage this show' USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent copies for this show: the second waits, then sees the first's rows.
  SELECT s.club_id INTO v_club_id
  FROM public.shows s
  JOIN public.clubs c ON c.id = s.club_id AND c.deleted_at IS NULL
  WHERE s.id = p_show_id
    AND s.deleted_at IS NULL
  FOR UPDATE OF s;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show or club not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.show_committee_members m WHERE m.show_id = p_show_id) THEN
    RAISE EXCEPTION 'show already has its own committee' USING ERRCODE = 'P0001';
  END IF;

  -- Same rows get_show_committee would print: a linked person who is soft-deleted is skipped.
  INSERT INTO public.show_committee_members (show_id, person_id, display_name, sort_order)
  SELECT p_show_id, m.person_id, m.display_name, m.sort_order
  FROM public.club_committee_members m
  LEFT JOIN public.people pe ON pe.id = m.person_id
  WHERE m.club_id = v_club_id
    AND (m.person_id IS NULL OR pe.deleted_at IS NULL)
  ORDER BY m.sort_order, m.created_at, m.id;

  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RETURN v_copied;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_club_committee_to_show(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_club_committee_to_show(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.copy_club_committee_to_show(uuid) IS
  'MYK9-2064: copies the club''s Event Committee into one show''s own list (keeps person_id for linked members, display_name for typed ones, and sort_order). can_manage_show gate; locks the show row; raises P0001 when the show already has its own list. Returns the number of rows copied.';

-- hard_delete_show: manifest + show_committee_members_show_id_fkey.
CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Regenerate from pg_constraint when the drift check names an edge. A new
  -- edge is 'retain' unless a reviewer can say why its rows are not
  -- participant, money, delivery or audit evidence. Every 'disposable' edge
  -- must be ON DELETE CASCADE from shows, trials or classes.
  v_fk_manifest CONSTANT pg_catalog.jsonb := $manifest$
  [
    {"constraint_schema" : "public", "constraint_name" : "announcements_show_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_show_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "calendar_feed_tokens_show_id_fkey", "child_schema" : "public", "child_table" : "calendar_feed_tokens", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dog_favorites_show_id_fkey", "child_schema" : "public", "child_table" : "dog_favorites", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dogs_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "dogs", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "email_log_show_id_fkey", "child_schema" : "public", "child_table" : "email_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "registrations_show_id_fkey", "child_schema" : "public", "child_table" : "enrollments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entries_show_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_carts_show_id_fkey", "child_schema" : "public", "child_table" : "entry_carts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_form_notes_show_id_fkey", "child_schema" : "public", "child_table" : "entry_form_notes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_payment_links_show_id_fkey", "child_schema" : "public", "child_table" : "entry_payment_links", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_show_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "people_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "people", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generation_attempts_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generation_attempts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generations_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generations", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "refund_requests_show_id_fkey", "child_schema" : "public", "child_table" : "refund_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_show_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "role_requests_show_id_fkey", "child_schema" : "public", "child_table" : "role_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "secretary_tasks_show_id_fkey", "child_schema" : "public", "child_table" : "secretary_tasks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_announcements_show_id_fkey", "child_schema" : "public", "child_table" : "show_announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_close_notes_show_id_fkey", "child_schema" : "public", "child_table" : "show_close_notes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_committee_members_show_id_fkey", "child_schema" : "public", "child_table" : "show_committee_members", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_eve_nudge_log_show_id_fkey", "child_schema" : "public", "child_table" : "show_eve_nudge_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_show_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_judge_supplies_show_id_fkey", "child_schema" : "public", "child_table" : "show_judge_supplies", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_steps_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_steps", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_message_threads_show_id_fkey", "child_schema" : "public", "child_table" : "show_message_threads", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_messages_show_id_fkey", "child_schema" : "public", "child_table" : "show_messages", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_money_locks_show_id_fkey", "child_schema" : "public", "child_table" : "show_money_locks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_officials_show_id_fkey", "child_schema" : "public", "child_table" : "show_officials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_passcodes_show_id_fkey", "child_schema" : "public", "child_table" : "show_passcodes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_payments_show_id_fkey", "child_schema" : "public", "child_table" : "show_payments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_payouts_show_id_fkey", "child_schema" : "public", "child_table" : "show_payouts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_visibility_settings_show_id_fkey", "child_schema" : "public", "child_table" : "show_visibility_settings", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "stripe_orders_show_id_fkey", "child_schema" : "public", "child_table" : "stripe_orders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "support_tickets_show_id_fkey", "child_schema" : "public", "child_table" : "support_tickets", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_generation_claims_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_generation_claims", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_print_reminders_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_print_reminders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_snapshots_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_snapshots", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trials_show_id_fkey", "child_schema" : "public", "child_table" : "trials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "user_roles_show_id_fkey", "child_schema" : "public", "child_table" : "user_roles", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteers_show_id_fkey", "child_schema" : "public", "child_table" : "volunteers", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "activity_log_trial_id_fkey", "child_schema" : "public", "child_table" : "activity_log", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "announcements_trial_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_trial_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "classes_trial_id_fkey", "child_schema" : "public", "child_table" : "classes", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_trial_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_trial_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_trial_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_trial_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_checklist_state_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_checklist_state", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_lunch_orders_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_lunch_orders", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "trial_visibility_overrides_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_visibility_overrides", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "cart_spot_holds_class_id_fkey", "child_schema" : "public", "child_table" : "cart_spot_holds", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "class_visibility_overrides_class_id_fkey", "child_schema" : "public", "child_table" : "class_visibility_overrides", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_class_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_cart_items_class_id_fkey", "child_schema" : "public", "child_table" : "entry_cart_items", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "NO ACTION", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_class_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_class_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_class_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "volunteer_class_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "waitlist_entries_class_id_fkey", "child_schema" : "public", "child_table" : "waitlist_entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_step_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "step_id", "parent_schema" : "public", "parent_table" : "show_lifecycle_email_steps", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_passcode_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_passcode_id", "parent_schema" : "public", "parent_table" : "show_passcodes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"}
  ]
  $manifest$::pg_catalog.jsonb;
  v_edge record;
  v_fk_drift text;
  v_orders integer;
  v_has_retained_child boolean;
  v_parent_scope text;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);

  -- SHARE UPDATE EXCLUSIVE conflicts with itself and with ADD FOREIGN KEY on
  -- the referenced table, but not with ordinary DML: two permanent deletes
  -- serialize, and the FK graph cannot change under the check below.
  LOCK TABLE public.classes IN SHARE UPDATE EXCLUSIVE MODE;
  LOCK TABLE public.trials IN SHARE UPDATE EXCLUSIVE MODE;
  LOCK TABLE public.shows IN SHARE UPDATE EXCLUSIVE MODE;
  -- Every other table the cascade sweeps, read from the manifest so a new
  -- disposable edge is locked too: otherwise a foreign key added to, say,
  -- show_passcodes could commit after the catalog check and the cascade would
  -- follow an unreviewed edge. A table missing from the catalog is skipped
  -- here and reported by the drift check below.
  FOR v_edge IN
    SELECT DISTINCT manifest.child_schema, manifest.child_table
    FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      child_schema text, child_table text, disposition text
    )
    WHERE manifest.disposition = 'disposable'
      AND manifest.child_table NOT IN ('shows', 'trials', 'classes')
      AND pg_catalog.to_regclass(
        pg_catalog.format('%I.%I', manifest.child_schema, manifest.child_table)
      ) IS NOT NULL
    ORDER BY manifest.child_schema, manifest.child_table
  LOOP
    EXECUTE pg_catalog.format(
      'LOCK TABLE %I.%I IN SHARE UPDATE EXCLUSIVE MODE', v_edge.child_schema, v_edge.child_table
    );
  END LOOP;

  PERFORM 1 FROM public.shows WHERE id = p_show_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.trials WHERE show_id = p_show_id ORDER BY id FOR UPDATE;
  PERFORM 1
  FROM public.classes AS c
  JOIN public.trials AS t ON t.id = c.trial_id
  WHERE t.show_id = p_show_id
  ORDER BY c.id
  FOR UPDATE OF c;

  -- Both directions, so a missing, extra, renamed, retargeted, re-columned or
  -- action-changed constraint refuses before any row is read or deleted. The
  -- parents checked are shows/trials/classes plus every table a disposable
  -- edge sweeps, so a table hanging off a swept table is covered too.
  WITH reviewed AS (
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
  ), swept AS (
    SELECT pg_catalog.to_regclass('public.shows') AS rel
    UNION SELECT pg_catalog.to_regclass(pg_catalog.format('%I.%I', child_schema, child_table))
    FROM reviewed WHERE disposition = 'disposable'
  ), actual AS (
    SELECT constraint_ns.nspname AS constraint_schema, c.conname AS constraint_name,
           child_ns.nspname AS child_schema, child.relname AS child_table,
           child_col.attname AS child_column, parent_ns.nspname AS parent_schema,
           parent.relname AS parent_table, parent_col.attname AS parent_column,
           CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
             WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT' END AS delete_action
    FROM pg_catalog.pg_constraint AS c
    JOIN pg_catalog.pg_namespace AS constraint_ns ON constraint_ns.oid = c.connamespace
    JOIN pg_catalog.pg_class AS child ON child.oid = c.conrelid
    JOIN pg_catalog.pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class AS parent ON parent.oid = c.confrelid
    JOIN pg_catalog.pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(c.conkey) WITH ORDINALITY AS child_key(attnum, ordinality)
    JOIN LATERAL pg_catalog.unnest(c.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality)
      ON parent_key.ordinality = child_key.ordinality
    JOIN pg_catalog.pg_attribute AS child_col
      ON child_col.attrelid = child.oid AND child_col.attnum = child_key.attnum
    JOIN pg_catalog.pg_attribute AS parent_col
      ON parent_col.attrelid = parent.oid AND parent_col.attnum = parent_key.attnum
    WHERE c.contype = 'f'
      AND c.confrelid IN (SELECT rel FROM swept WHERE rel IS NOT NULL)
  ), delta AS (
    (SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM actual
     EXCEPT
     SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM reviewed)
    UNION ALL
    (SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM reviewed
     EXCEPT
     SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM actual)
    UNION ALL
    -- A disposable edge is swept by the cascade from a show, trial or class;
    -- anything else would leave rows behind or fail at the final DELETE.
    SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
           parent_schema, parent_table, parent_column, delete_action
    FROM reviewed
    WHERE disposition = 'disposable'
      AND (delete_action <> 'CASCADE' OR parent_table NOT IN ('shows', 'trials', 'classes'))
  )
  SELECT pg_catalog.string_agg(
    DISTINCT constraint_schema || '.' || constraint_name, ', '
    ORDER BY constraint_schema || '.' || constraint_name
  ) INTO v_fk_drift
  FROM delta;

  IF v_fk_drift IS NOT NULL THEN
    RAISE EXCEPTION 'Permanent deletion is refused: foreign key(s) % changed since hard_delete_show was last reviewed. No data was deleted.', v_fk_drift
      USING ERRCODE = 'MK615',
            HINT = 'Classify the edge in the hard_delete_show manifest before deleting.';
  END IF;

  -- MYK9-527's readable refusal, kept verbatim: either column alone ties an
  -- order to this show.
  SELECT pg_catalog.count(*) INTO v_orders
  FROM public.stripe_orders AS so
  WHERE so.show_id = p_show_id
     OR so.enrollment_id IN (SELECT e.id FROM public.enrollments AS e WHERE e.show_id = p_show_id);

  IF v_orders > 0 THEN
    RAISE EXCEPTION
      'This show has % Stripe order(s); refunds and reconciliation still reference them. Permanent deletion is refused. Resolve or reassign those orders first.', v_orders
      USING ERRCODE = 'MK615';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entries AS e
    WHERE e.show_id IS DISTINCT FROM p_show_id
      AND (e.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
        OR e.class_id IN (
          SELECT c.id FROM public.classes AS c
          JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
        )
        OR e.registration_id IN (SELECT r.id FROM public.enrollments AS r WHERE r.show_id = p_show_id))
  ) THEN
    RAISE EXCEPTION 'Permanent deletion is refused: an entry in another show points at this show''s trials, classes or enrollments.'
      USING ERRCODE = 'MK615';
  END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments AS r WHERE r.show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.entries AS e
       WHERE e.show_id = p_show_id
          OR e.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
          OR e.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
     ) THEN
    RAISE EXCEPTION 'This show has entries or enrollments, so it cannot be permanently deleted. Permanent deletion is limited to unused shows; keep it in the trash instead.'
      USING ERRCODE = 'MK615';
  END IF;

  -- Money and delivery rows that name the show without a foreign key, so
  -- pg_constraint cannot see them.
  IF EXISTS (SELECT 1 FROM public.cart_fulfillments AS f WHERE f.show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.cart_fulfillment_lines AS l
       WHERE l.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
          OR l.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
     ) THEN
    RAISE EXCEPTION 'This show has checkout fulfillment records in public.cart_fulfillments that must be kept for reconciliation, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.show_lifecycle_email_job_requests AS q WHERE q.show_id = p_show_id
  ) THEN
    RAISE EXCEPTION 'This show has email delivery records in public.show_lifecycle_email_job_requests that must be kept, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;
  -- "Results Posted" push state, keyed by class with no foreign key: a delete
  -- would orphan it and private.retry_class_results_push would keep retrying.
  IF EXISTS (
    SELECT 1 FROM private.class_results_push AS p
    WHERE p.class_id IN (
      SELECT c.id FROM public.classes AS c
      JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
    )
  ) THEN
    RAISE EXCEPTION 'This show has results push delivery records in private.class_results_push that must be kept, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;

  -- Identifiers come only from the constant manifest (already proven equal to
  -- the catalog) and pass through %I; the show id is bound with USING.
  FOR v_edge IN
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
    WHERE disposition = 'retain'
    ORDER BY parent_table, child_table, constraint_name
  LOOP
    IF v_edge.parent_table = 'shows' THEN
      v_parent_scope := 'SELECT $1';
    ELSIF v_edge.parent_table = 'trials' THEN
      v_parent_scope := 'SELECT target_trial.id FROM public.trials AS target_trial '
        'WHERE target_trial.show_id = $1';
    ELSIF v_edge.parent_table = 'classes' THEN
      v_parent_scope := 'SELECT target_class.id FROM public.classes AS target_class '
        'JOIN public.trials AS target_trial ON target_trial.id = target_class.trial_id '
        'WHERE target_trial.show_id = $1';
    ELSE
      -- A swept configuration table: the parent rows in scope are the ones its
      -- disposable edges would cascade away.
      SELECT pg_catalog.format(
        'SELECT swept.%I FROM %I.%I AS swept WHERE %s',
        v_edge.parent_column, v_edge.parent_schema, v_edge.parent_table,
        pg_catalog.string_agg(
          pg_catalog.format('swept.%I IN (%s)', d.child_column,
            CASE d.parent_table
              WHEN 'shows' THEN 'SELECT $1'
              WHEN 'trials' THEN 'SELECT t.id FROM public.trials AS t WHERE t.show_id = $1'
              ELSE 'SELECT c.id FROM public.classes AS c JOIN public.trials AS t '
                   'ON t.id = c.trial_id WHERE t.show_id = $1'
            END),
          ' OR ' ORDER BY d.constraint_name)
      ) INTO v_parent_scope
      FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS d(
        constraint_name text, child_schema text, child_table text, child_column text,
        parent_table text, disposition text
      )
      WHERE d.disposition = 'disposable'
        AND d.child_schema = v_edge.parent_schema
        AND d.child_table = v_edge.parent_table;
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I AS child WHERE child.%I IN (%s))',
      v_edge.child_schema, v_edge.child_table, v_edge.child_column, v_parent_scope
    ) INTO v_has_retained_child USING p_show_id;

    IF v_has_retained_child THEN
      RAISE EXCEPTION 'This show has records in %.% that must be kept for history and reconciliation, so it cannot be permanently deleted. Permanent deletion is limited to unused shows.',
        v_edge.child_schema, v_edge.child_table
        USING ERRCODE = 'MK615',
              DETAIL = pg_catalog.format('Blocking foreign key: %s.%s', v_edge.constraint_schema, v_edge.constraint_name);
    END IF;
  END LOOP;

  -- Classes first so their cascades run while the trials still exist; the
  -- show's own delete then sweeps the remaining disposable configuration.
  DELETE FROM public.classes AS c
  USING public.trials AS t
  WHERE t.id = c.trial_id AND t.show_id = p_show_id;
  DELETE FROM public.trials WHERE show_id = p_show_id;
  DELETE FROM public.shows WHERE id = p_show_id;
EXCEPTION
  WHEN deadlock_detected THEN
    RAISE;
  WHEN lock_not_available THEN
    RAISE EXCEPTION
      'The show could not be deleted because the database was busy; no data was deleted. Try again in a quiet moment.'
      USING ERRCODE = '55P03';
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
