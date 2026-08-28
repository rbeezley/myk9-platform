-- MYK9-258: a show with no club must not be manageable by every secretary.
--
-- `is_trial_secretary(check_club_id)` and `is_club_admin(check_club_id)` both
-- filter with:
--
--   AND (check_club_id IS NULL OR ur.club_id = check_club_id)
--
-- That branch exists so the NO-ARGUMENT form answers "is this user a secretary
-- (or club admin) anywhere?", which ~115 call sites rely on. But the callers
-- below pass a SHOW's `club_id` positionally, and `shows.club_id` is nullable —
-- so a show with no club supplies NULL, which reads as "no club filter" rather
-- than "this show has no club", the club test is skipped, and EVERY active
-- secretary or club admin on the platform matches.
--
-- Two meanings collapse onto one NULL:
--   * the caller asked for no filter        -> match any club
--   * the row being tested has no club      -> must match nothing
--
-- Found on staging 2026-08-28 by the G9 rehearsal's per-show scope assertion:
-- four secretaries in four DIFFERENT clubs each reported managing the same
-- extra show, `e8675466-…` ("ZZ Audit - Secretary Task Walk", club_id NULL).
-- It fails OPEN and is invisible in the UI, because the extra show renders
-- exactly like a legitimate one.
--
-- The fix is the guard this codebase already uses in `get_show_officials` and
-- `can_manage_show_lifecycle_email`, applied to the five callers that lack it:
--
--   s.club_id IS NOT NULL AND (SELECT public.is_… (s.club_id))
--
-- Inverting the helpers instead — making the parameterised form mean "this club
-- only" and moving "anywhere?" to a new name — would have been structurally
-- safer, but it puts every RLS policy using the no-argument form in the blast
-- radius. That is a larger change than this defect warrants; the contract test
-- registered with this migration is what stops a sixth caller reintroducing it.
--
-- Site admins are unaffected: they reach every show through the separate
-- `is_site_admin()` / `is_platform_admin()` arms, which have no club dimension.
--
-- Bodies are copied from the LIVE definitions, not from the migration whose
-- filename looks canonical — several migrations have replaced these and the
-- newest filename is not the newest definition.

BEGIN;

-- ---------------------------------------------------------------------------
-- can_manage_show — gates RLS across the schema, so this is the widest one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_show(check_show_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.shows s
    WHERE s.id = check_show_id
    AND (
      (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
      OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
      OR (SELECT public.is_platform_admin())
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- can_manage_trial — same shape, reached through the trial's show.
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
      (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
      OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
      OR (SELECT public.is_platform_admin())
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- manageable_show_ids — where the defect was observed.
--
-- The show-scoped arm is deliberately NOT guarded: it matches on
-- `ur.show_id = s.id`, an explicit per-show grant that says nothing about clubs
-- and is correct for a club-less show.
--
-- The absent `deleted_at` filter is also deliberate and pinned by
-- entries_manager_policy_hashable_test.sql: MYK9-126 wants entries of draft and
-- soft-deleted shows to stay visible to club-scoped managers. Not touched here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manageable_show_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT s.id
  FROM public.shows s
  WHERE (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
     OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
     OR (SELECT public.is_site_admin())
     OR EXISTS (
       SELECT 1
       FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.auth_user_id = auth.uid()
         AND r.name = 'secretary'
         AND ur.show_id = s.id
         AND ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
     );
$function$;

-- ---------------------------------------------------------------------------
-- is_show_office_manager — its own show-scoped arm is likewise left alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_show_office_manager(check_show_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.shows s
    WHERE s.id = check_show_id
      AND (
        (SELECT public.is_site_admin())
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.auth_user_id = auth.uid()
            AND ur.is_active = true
            AND (ur.expires_at IS NULL OR ur.expires_at > now())
            AND r.name IN ('secretary', 'trial_secretary')
            AND ur.show_id = check_show_id
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- get_entries_for_export — exports PII (owner email/phone), so the club-less
-- show handed every secretary a full entrant export.
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
        AND s.club_id IS NOT NULL
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
-- EXECUTE decisions.
--
-- CREATE OR REPLACE preserves an existing ACL, so every statement below is a
-- no-op against the applied database — verified against live: all five hold
-- `postgres=X | service_role=X | authenticated=X` and anon has none. They are
-- here so the migration carries its own disposition for a migrations-only
-- rebuild, and so the grant-decision contract can see one.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.can_manage_show(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_show(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_trial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_trial(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_show_office_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_office_manager(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_entries_for_export(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entries_for_export(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.manageable_show_ids() IS
  'Shows the caller may manage: club admin or trial secretary of the show''s '
  'club, site admin, or an explicit show-scoped secretary grant. The two '
  'club-scoped arms are guarded by `club_id IS NOT NULL` because '
  'is_club_admin/is_trial_secretary treat a NULL argument as "no club filter", '
  'which would otherwise return every club-less show to every secretary '
  '(MYK9-258). Deliberately unfiltered by deleted_at so club-scoped managers '
  'keep seeing draft and soft-deleted shows (MYK9-126).';

COMMIT;

NOTIFY pgrst, 'reload schema';
