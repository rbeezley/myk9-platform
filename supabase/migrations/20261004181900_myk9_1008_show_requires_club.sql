-- =============================================================================
-- MYK9-1008: a show must belong to a club
-- =============================================================================
--
-- Owner decision (2026-10-04): "A show should not be able to be created
-- without a club." shows.club_id was nullable; live had 0 of 10 shows with a
-- NULL club_id when this was written (read-only check, 2026-10-04).
--
-- 1. Refuse a NULL club_id at the column. The NULL check runs inside this
--    transaction, after a lock that blocks concurrent writes, and raises with
--    the offending ids rather than letting SET NOT NULL fail with a bare 23502.
--
-- 2. The FK already cannot null the column out: shows_club_id_fkey is
--    ON DELETE RESTRICT (20260829120000_restrict_club_deletion_with_shows.sql,
--    verified on live 2026-10-04: confdeltype = 'r'). Club deletion is a soft
--    delete (soft_delete_club) plus a hard delete refused while the club hosts
--    a show, so RESTRICT is the behaviour the app already relies on. It is
--    re-asserted below so a later FK rebuild cannot silently loosen it.
--
-- 3. Remove the MYK9-258 `club_id IS NOT NULL AND ...` guards that only
--    existed for clubless shows, where they are provably dead: every one reads
--    club_id from a shows row reached by FROM / inner JOIN (no LEFT JOIN), so
--    the value is the NOT NULL column itself.
--      * 10 functions, each copied from the LATEST migration that defines it
--        (named above each one) and verified byte-identical to live
--        pg_get_functiondef before editing; only the guards change.
--      * 23 policies, via ALTER POLICY (roles and command unchanged). The
--        expressions are the live pg_policies deparse (live == origin/main for
--        these objects: the only main migration not yet on live,
--        20261004152300, touches none of them) with the guard text removed.
--    For INSERT/UPDATE WITH CHECK on shows, a NULL club_id now fails the
--    column constraint (23502) instead of the policy (42501): still refused.
--
--    LEFT IN PLACE, deliberately (not provably dead):
--      * `v_club_id IS NULL` / `IS NOT NULL` on a variable filled by
--        SELECT ... INTO from shows (soft_delete_show, restore_show,
--        update_show_style, set_entry_refund_decision, ringside_update_entry,
--        refresh_class_scoring_state_authorized, get_show_access_codes,
--        _can_manage_show_passcodes, grant/revoke_show_official,
--        get_show_class_hide_counts): a show id that matches no row also
--        leaves the variable NULL, and is_club_admin(NULL) /
--        is_trial_secretary(NULL) mean "any club", so these guards still stop
--        a not-found id from authorizing every club admin.
--      * enforce_show_club_authorization / enforce_show_publish_gate
--        `NEW.club_id IS NULL` branches: BEFORE triggers run before the
--        column constraint, so those branches are still reachable.
--      * create_show_with_children's `p_show must include a non-null club_id`
--        check: it is the RPC's own input validation.
--      * show_templates_select (show_templates.club_id is a different,
--        nullable column) and every user_roles.club_id predicate.
-- =============================================================================

BEGIN;

-- The policy expressions below are the live deparse, which names public
-- objects unqualified.
SET LOCAL search_path = public, pg_catalog;

LOCK TABLE public.shows IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_ids text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO v_ids
    FROM public.shows
   WHERE club_id IS NULL;
  IF v_ids IS NOT NULL THEN
    RAISE EXCEPTION 'MYK9-1008: shows without a club must be assigned one before club_id can be NOT NULL: %', v_ids;
  END IF;
END;
$$;

ALTER TABLE public.shows ALTER COLUMN club_id SET NOT NULL;

DO $$
BEGIN
  IF (SELECT confdeltype FROM pg_constraint
       WHERE conname = 'shows_club_id_fkey'
         AND conrelid = 'public.shows'::regclass) IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'MYK9-1008: shows_club_id_fkey must be ON DELETE RESTRICT';
  END IF;
END;
$$;

COMMENT ON COLUMN public.shows.club_id IS
  'The club hosting this show. NOT NULL (MYK9-1008): every show belongs to a club. FK shows_club_id_fkey is ON DELETE RESTRICT, so a club that hosts a show cannot be hard-deleted.';

-- =============================================================================
-- Functions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- can_manage_show (copied from 20260919135700_enrollment_select_show_scope.sql)
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_show(check_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = check_show_id
      and (
        (select public.is_platform_admin())
        or exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.auth_user_id = (select auth.uid())
            and r.name = 'club_admin'
            and ur.club_id = s.club_id
            and (ur.show_id is null or ur.show_id = s.id)
            and ur.is_active = true
            and (ur.expires_at is null or ur.expires_at > now())
        )
        or (select public.is_trial_secretary(s.club_id))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- can_manage_show_lifecycle_email (copied from 20260710080000_security_audit_remediation_lifecycle_hardening.sql)
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_show_lifecycle_email(p_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_site_admin()
    or public.is_show_secretary(p_show_id)
    or exists (
      select 1
      from public.shows s
      where s.id = p_show_id
        and (
          public.is_club_admin(s.club_id)
          or public.is_trial_secretary(s.club_id)
        )
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- can_manage_trial (copied from 20260828230000_null_club_show_authorization.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_trial(check_trial_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.trials t
    JOIN public.shows s ON s.id = t.show_id
    WHERE t.id = check_trial_id
    AND (
      (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_trial_secretary(s.club_id))
      OR (SELECT public.is_platform_admin())
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- entry_enrollment_select_show_ids (copied from 20260919135700_enrollment_select_show_scope.sql)
-- ---------------------------------------------------------------------------
create or replace function public.entry_enrollment_select_show_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Club-scoped managers retain club-wide access within their own club.
  select s.id
  from public.shows s
  where (select public.is_site_admin())
     or exists (
       select 1
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id
       where ur.auth_user_id = (select auth.uid())
         and r.name = 'club_admin'
         and ur.club_id = s.club_id
         and ur.show_id is null
         and ur.is_active = true
         and (ur.expires_at is null or ur.expires_at > now())
     )
     or (select public.is_trial_secretary(s.club_id))

  union

  -- A show-pinned club_admin is limited to the show named by that row.
  select ur.show_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.shows s on s.id = ur.show_id and s.club_id = ur.club_id
  where ur.auth_user_id = (select auth.uid())
    and r.name = 'club_admin'
    and ur.show_id is not null
    and ur.is_active = true
    and (ur.expires_at is null or ur.expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- get_entries_for_export (copied from 20260828230000_null_club_show_authorization.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_entries_for_export(p_show_id uuid)
 RETURNS TABLE(id uuid, armband text, handler text, payment_status text, entry_status text, entry_fee numeric, submitted_at timestamp with time zone, special_requests text, jump_height text, run_order integer, dog_id uuid, dog_name text, dog_call_name text, dog_breed text, owner_first_name text, owner_last_name text, owner_email text, owner_phone text, dog_registrations jsonb, class_name text, class_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = p_show_id
        AND (SELECT public.is_trial_secretary(s.club_id))
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.armband,
    e.handler,
    e.payment_status,
    e.entry_status,
    e.entry_fee,
    e.submitted_at,
    e.special_requests,
    e.jump_height,
    e.run_order,
    d.id                AS dog_id,
    d.name              AS dog_name,
    d.call_name         AS dog_call_name,
    d.breed             AS dog_breed,
    op.first_name       AS owner_first_name,
    op.last_name        AS owner_last_name,
    op.email            AS owner_email,
    op.phone            AS owner_phone,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'organization',        dr.organization,
            'registration_number', dr.registration_number
          )
          ORDER BY dr.organization
        )
        FROM public.dog_registrations dr
        WHERE dr.dog_id = d.id
      ),
      '[]'::jsonb
    )                   AS dog_registrations,
    c.name              AS class_name,
    c.class_number::text
  FROM public.entries e
  LEFT JOIN public.dogs   d  ON d.id  = e.dog_id
  LEFT JOIN public.people op ON op.id = d.owner_id
  LEFT JOIN public.classes c  ON c.id  = e.class_id
  WHERE e.show_id    = p_show_id
    AND e.deleted_at IS NULL
  ORDER BY e.armband ASC NULLS LAST;
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_show_judges (copied from 20260912211500_get_show_judges_for_public_surfaces.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_show_judges(p_show_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  person_id uuid,
  first_name text,
  last_name text,
  trial_id uuid,
  class_id uuid,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ja.id AS assignment_id,
    ja.person_id,
    pe.first_name,
    pe.last_name,
    ja.trial_id,
    ja.class_id,
    ja.status
  FROM public.judge_assignments ja
  JOIN public.shows s ON s.id = ja.show_id
  JOIN public.people pe ON pe.id = ja.person_id
  WHERE ja.show_id = p_show_id
    AND s.deleted_at IS NULL
    -- Same gate as get_show_officials, and the same set MYK9-469 made anon-visible on
    -- judge_assignments itself, so the RPC cannot expose a show the table would have hidden.
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- get_show_officials (copied from 20260905145500_withhold_steward_email_from_public_officials.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_show_officials(p_show_id uuid)
RETURNS TABLE (user_id uuid, first_name text, last_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    so.person_id AS user_id,
    pe.first_name,
    pe.last_name,
    CASE
      -- Secretary and chairman are the paperwork contacts the premium list
      -- publishes. Unchanged, deliberately public.
      WHEN so.role <> 'steward' THEN pe.email
      -- A steward's address is operational, not published. Managers only, via
      -- the CANONICAL predicate rather than a hand-rolled arm list.
      --
      -- The first draft spelled this out as
      --   is_site_admin() OR is_club_admin(s.club_id) OR is_show_secretary(s.id)
      -- which silently excluded a whole supported role. is_show_secretary
      -- matches r.name = 'secretary' only, while is_trial_secretary — and so
      -- can_manage_show — matches ('secretary', 'trial_secretary'). A
      -- club-scoped TRIAL_SECRETARY would therefore be a show manager everywhere
      -- else in this schema while losing the steward's address here.
      --
      -- Measured before changing it: no such role is SEEDED. public.roles holds
      -- exactly chairman, club_admin, exhibitor, judge, secretary, site_admin,
      -- steward — so is_trial_secretary's 'trial_secretary' arm is dead and the
      -- two predicates select the same people today. This is hardening against
      -- a role name the schema already believes in, not a live exposure, and it
      -- is not behaviourally testable until that role exists. Using the
      -- canonical predicate is also simply less to get wrong. Raised in review
      -- of #2045.
      WHEN (SELECT public.can_manage_show(s.id)) THEN pe.email
      ELSE NULL
    END AS email,
    so.role
  FROM public.show_officials so
  JOIN public.shows s ON s.id = so.show_id
  JOIN public.people pe ON pe.id = so.person_id
  WHERE so.show_id = p_show_id
    AND s.deleted_at IS NULL
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- is_show_office_manager (copied from 20260919135700_enrollment_select_show_scope.sql)
-- ---------------------------------------------------------------------------
create or replace function public.is_show_office_manager(check_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = check_show_id
      and (
        (select public.is_site_admin())
        or exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.auth_user_id = (select auth.uid())
            and r.name = 'club_admin'
            and ur.club_id = s.club_id
            and (ur.show_id is null or ur.show_id = s.id)
            and ur.is_active = true
            and (ur.expires_at is null or ur.expires_at > now())
        )
        or (select public.is_trial_secretary(s.club_id))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- manageable_show_ids (copied from 20260830240000_show_officials_separates_label_from_permission.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manageable_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.shows s
  -- MYK9-1008: shows.club_id is NOT NULL, so the MYK9-258 `s.club_id IS NOT
  -- NULL` guards are gone. is_club_admin / is_trial_secretary still read a
  -- NULL argument as "any club"; only a non-null column makes this safe.
  WHERE (SELECT public.is_club_admin(s.club_id))
     OR (SELECT public.is_trial_secretary(s.club_id))
     OR (SELECT public.is_site_admin());
$$;

-- ---------------------------------------------------------------------------
-- trial_secretary_show_ids (copied from 20260912171500_scope_unscoped_role_predicates.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trial_secretary_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.shows s
  WHERE (SELECT public.is_trial_secretary(s.club_id))
     OR (SELECT public.is_site_admin());
$$;

-- Execute decisions, restated unchanged from live (pg_proc.proacl, 2026-10-04).
-- CREATE OR REPLACE keeps an existing ACL; this pins it so a rebuild from
-- migrations cannot drift. get_show_judges / get_show_officials stay anon-
-- callable (public premium surfaces); the rest are signed-in only.
REVOKE ALL ON FUNCTION public.can_manage_show(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_show(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_show(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_show_lifecycle_email(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_show_lifecycle_email(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_show_lifecycle_email(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_trial(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_trial(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_trial(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entry_enrollment_select_show_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.entry_enrollment_select_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.entry_enrollment_select_show_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_entries_for_export(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_entries_for_export(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_entries_for_export(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_show_judges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_show_office_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_show_office_manager(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_show_office_manager(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manageable_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trial_secretary_show_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trial_secretary_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.trial_secretary_show_ids() TO authenticated, service_role;

-- =============================================================================
-- Policies (ALTER POLICY keeps roles and command; only the expressions change)
-- =============================================================================

-- class_visibility_overrides.class_visibility_insert (INSERT)
ALTER POLICY class_visibility_insert ON public.class_visibility_overrides
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((classes c
     JOIN trials t ON ((t.id = c.trial_id)))
     JOIN shows s ON ((s.id = t.show_id)))
  WHERE ((c.id = class_visibility_overrides.class_id) AND ((( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin))))));

-- class_visibility_overrides.class_visibility_update (UPDATE)
ALTER POLICY class_visibility_update ON public.class_visibility_overrides
  USING ((EXISTS ( SELECT 1
   FROM ((classes c
     JOIN trials t ON ((t.id = c.trial_id)))
     JOIN shows s ON ((s.id = t.show_id)))
  WHERE ((c.id = class_visibility_overrides.class_id) AND ((( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin))))));

-- classes.classes_select (SELECT)
ALTER POLICY classes_select ON public.classes
  USING (((deleted_at IS NULL) AND (trial_id IN ( SELECT t.id
   FROM (trials t
     JOIN shows s ON ((s.id = t.show_id)))
  WHERE (((s.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])) AND (s.deleted_at IS NULL)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR (( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR ( SELECT is_platform_admin() AS is_platform_admin) OR (s.id IN ( SELECT private.get_my_judge_assigned_show_ids() AS get_my_judge_assigned_show_ids)) OR ((s.deleted_at IS NULL) AND ((s.id)::text = ( SELECT private.get_current_ringside_staff_show_id() AS get_current_ringside_staff_show_id))))))));

-- entry_payment_links.entry_payment_links_select (SELECT)
ALTER POLICY entry_payment_links_select ON public.entry_payment_links
  USING ((( SELECT is_site_admin() AS is_site_admin) OR ( SELECT is_show_secretary(entry_payment_links.show_id) AS is_show_secretary) OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = entry_payment_links.show_id) AND ( SELECT is_club_admin(s.club_id) AS is_club_admin))))));

-- entry_status_history.entry_status_history_select (SELECT)
ALTER POLICY entry_status_history_select ON public.entry_status_history
  USING ((EXISTS ( SELECT 1
   FROM (entries e
     JOIN shows s ON ((s.id = e.show_id)))
  WHERE ((e.id = entry_status_history.entry_id) AND (is_show_official(e.show_id) OR (is_club_admin(s.club_id)))))));

-- show_announcements.Authenticated users can create announcements (INSERT)
ALTER POLICY "Authenticated users can create announcements" ON public.show_announcements
  WITH CHECK ((((author_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_announcements.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))) OR (EXISTS ( SELECT 1
   FROM (judge_assignments ja
     JOIN people p ON ((p.id = ja.person_id)))
  WHERE ((ja.show_id = show_announcements.show_id) AND (p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.deleted_at IS NULL) AND (ja.status = ANY (ARRAY['confirmed'::text, 'invited'::text]))))))) OR ( SELECT is_platform_admin() AS is_platform_admin)));

-- show_announcements.Author or admin can delete announcements (DELETE)
ALTER POLICY "Author or admin can delete announcements" ON public.show_announcements
  USING (((( SELECT auth.uid() AS uid) = author_id) OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_announcements.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))) OR ( SELECT is_platform_admin() AS is_platform_admin)));

-- show_announcements.Author or admin can update announcements (UPDATE)
ALTER POLICY "Author or admin can update announcements" ON public.show_announcements
  USING (((( SELECT auth.uid() AS uid) = author_id) OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_announcements.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))) OR ( SELECT is_platform_admin() AS is_platform_admin)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_announcements.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))) OR ((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (judge_assignments ja
     JOIN people p ON ((p.id = ja.person_id)))
  WHERE ((ja.show_id = show_announcements.show_id) AND (p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.deleted_at IS NULL) AND (ja.status = ANY (ARRAY['confirmed'::text, 'invited'::text])))))) OR ( SELECT is_platform_admin() AS is_platform_admin)));

-- show_message_threads.threads_insert (INSERT)
ALTER POLICY threads_insert ON public.show_message_threads
  WITH CHECK (((participant_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_message_threads.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))))));

-- show_message_threads.threads_select (SELECT)
ALTER POLICY threads_select ON public.show_message_threads
  USING (((participant_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_message_threads.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))))));

-- show_messages.messages_insert (INSERT)
ALTER POLICY messages_insert ON public.show_messages
  WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))))))))));

-- show_messages.messages_select (SELECT)
ALTER POLICY messages_select ON public.show_messages
  USING ((EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))))))));

-- show_messages.messages_update_read (UPDATE)
ALTER POLICY messages_update_read ON public.show_messages
  USING ((EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))))))));

-- show_payouts.show_payouts_select (SELECT)
ALTER POLICY show_payouts_select ON public.show_payouts
  USING ((( SELECT is_site_admin() AS is_site_admin) OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_payouts.show_id) AND ((is_club_admin(s.club_id)) OR is_show_secretary(s.id)))))));

-- show_visibility_settings.show_visibility_insert (INSERT)
ALTER POLICY show_visibility_insert ON public.show_visibility_settings
  WITH CHECK ((EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_visibility_settings.show_id) AND ((( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin))))));

-- show_visibility_settings.show_visibility_update (UPDATE)
ALTER POLICY show_visibility_update ON public.show_visibility_settings
  USING ((EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_visibility_settings.show_id) AND ((( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin))))));

-- shows.shows_delete (DELETE)
ALTER POLICY shows_delete ON public.shows
  USING (((( SELECT is_club_admin(shows.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin)));

-- shows.shows_insert (INSERT)
ALTER POLICY shows_insert ON public.shows
  WITH CHECK (((( SELECT is_club_admin(shows.club_id) AS is_club_admin)) OR (( SELECT is_trial_secretary(shows.club_id) AS is_trial_secretary)) OR ( SELECT is_site_admin() AS is_site_admin)));

-- shows.shows_select (SELECT)
ALTER POLICY shows_select ON public.shows
  USING ((( SELECT is_site_admin() AS is_site_admin) OR ((deleted_at IS NULL) AND ((status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])) OR (( SELECT is_club_admin(shows.club_id) AS is_club_admin)) OR ( SELECT is_show_secretary(shows.id) AS is_show_secretary) OR (id IN ( SELECT private.get_my_judge_assigned_show_ids() AS get_my_judge_assigned_show_ids)) OR ((id)::text = ( SELECT private.get_current_ringside_staff_show_id() AS get_current_ringside_staff_show_id))))));

-- shows.shows_update (UPDATE)
ALTER POLICY shows_update ON public.shows
  USING (((( SELECT is_club_admin(shows.club_id) AS is_club_admin)) OR (( SELECT is_trial_secretary(shows.club_id) AS is_trial_secretary)) OR ( SELECT is_site_admin() AS is_site_admin) OR ( SELECT is_platform_admin() AS is_platform_admin)))
  WITH CHECK (((( SELECT is_club_admin(shows.club_id) AS is_club_admin)) OR (( SELECT is_trial_secretary(shows.club_id) AS is_trial_secretary)) OR ( SELECT is_site_admin() AS is_site_admin) OR ( SELECT is_platform_admin() AS is_platform_admin)));

-- trial_visibility_overrides.trial_visibility_insert (INSERT)
ALTER POLICY trial_visibility_insert ON public.trial_visibility_overrides
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (trials t
     JOIN shows s ON ((s.id = t.show_id)))
  WHERE ((t.id = trial_visibility_overrides.trial_id) AND ((( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin))))));

-- trial_visibility_overrides.trial_visibility_update (UPDATE)
ALTER POLICY trial_visibility_update ON public.trial_visibility_overrides
  USING ((EXISTS ( SELECT 1
   FROM (trials t
     JOIN shows s ON ((s.id = t.show_id)))
  WHERE ((t.id = trial_visibility_overrides.trial_id) AND ((( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR ( SELECT is_platform_admin() AS is_platform_admin))))));

-- trials.trials_select (SELECT)
ALTER POLICY trials_select ON public.trials
  USING ((show_id IN ( SELECT s.id
   FROM shows s
  WHERE (((s.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])) AND (s.deleted_at IS NULL)) OR (( SELECT is_club_admin(s.club_id) AS is_club_admin)) OR (( SELECT is_trial_secretary(s.club_id) AS is_trial_secretary)) OR ( SELECT is_platform_admin() AS is_platform_admin) OR (s.id IN ( SELECT private.get_my_judge_assigned_show_ids() AS get_my_judge_assigned_show_ids)) OR ((s.deleted_at IS NULL) AND ((s.id)::text = ( SELECT private.get_current_ringside_staff_show_id() AS get_current_ringside_staff_show_id)))))));

COMMIT;
