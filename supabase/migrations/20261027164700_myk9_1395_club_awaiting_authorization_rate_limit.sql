-- MYK9-1395 (SA-2026-10-24-04): bound the MYK9-1315 club-awaiting-authorization
-- notice. clubs_insert lets any active secretary or club admin insert clubs
-- (MYK9-572), and this SECURITY DEFINER trigger wrote one notification per site
-- admin per club with the caller-supplied name, so N inserts meant N rows per
-- admin of attacker-controlled text.
--
-- Changes against 20261022013700 (the latest definition; body copied from it):
--   1. Skip when the same auth.uid() already has another club that is still
--      unauthorized and not soft-deleted: one outstanding notice set per creator
--      until a site admin acts. A revoked club (authorized_at back to NULL) counts
--      as pending again, which is correct: it is awaiting authorization. There is
--      no "declined" column; deleted_at is the only other way out.
--   2. The interpolated name is capped at 80 characters (ellipsis when cut).
-- A multi-row INSERT raises no notice at all: row-level AFTER triggers fire at
-- the end of the statement, so each row sees its siblings as pending. That is
-- inside the bound, and the Onboarding list still shows every pending club.
-- Rejected: a time window (N per hour still lets N through). The pending-club
-- rule bounds the set to one, and Admin -> Onboarding lists every pending club,
-- so a suppressed notice hides nothing.
-- Trigger definition and notifications_type_check are untouched.

CREATE OR REPLACE FUNCTION public.notify_site_admins_club_awaiting_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creator text;
  v_link text := '/clubs/' || NEW.id;
  -- MYK9-1395: the name is caller-supplied; cap what reaches an admin's inbox.
  v_name text := CASE WHEN char_length(NEW.name) > 80
                      THEN left(NEW.name, 80) || '...' ELSE NEW.name END;
BEGIN
  -- Seeds and service_role have no auth.uid(); a site admin's own club is
  -- authorized at creation, so nobody needs telling.
  IF auth.uid() IS NULL OR public.is_site_admin() THEN
    RETURN NEW;
  END IF;

  -- NEW does not reflect the authorize trigger's UPDATE; read the row.
  IF EXISTS (
    SELECT 1 FROM public.clubs WHERE id = NEW.id AND authorized_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- MYK9-1395: one outstanding notice set per creator. While an earlier club of
  -- this creator is still waiting (not authorized, not soft-deleted), a further
  -- insert raises nothing; Admin -> Onboarding lists every pending club.
  IF EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.created_by = auth.uid()
      AND c.id <> NEW.id
      AND c.authorized_at IS NULL
      AND c.deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(
           nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           nullif(btrim(p.email), ''),
           'A secretary'
         )
  INTO v_creator
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;
  v_creator := coalesce(v_creator, 'A secretary');

  -- One row per active site admin per club (re-runnable without duplicates).
  INSERT INTO public.notifications (user_id, type, message, deep_link_url)
  SELECT DISTINCT
    p.auth_user_id,
    'club_awaiting_authorization',
    format('%s was created by %s and is waiting for authorization.', v_name, v_creator),
    v_link
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'site_admin'
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND p.status = 'active'
    AND p.auth_user_id IS NOT NULL
    -- people.auth_user_id has no FK to auth.users, but notifications.user_id
    -- does: a stale id would abort the secretary's club INSERT.
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.auth_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p.auth_user_id
        AND n.type = 'club_awaiting_authorization'
        AND n.deep_link_url = v_link
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_site_admins_club_awaiting_authorization() IS
  'MYK9-1315/MYK9-1395: AFTER INSERT ON clubs. When a non-site-admin account inserts a club that is still unauthorized, writes one club_awaiting_authorization in-app notification per active site admin (deep link /clubs/<id>). Skipped while the same creator has another club still unauthorized and not deleted (one outstanding notice set per creator); the club name is capped at 80 characters. Seed/service_role inserts (no auth.uid()) and site admins'' own inserts raise nothing.';

-- Trigger-only: fired by the trigger as its owner, never callable by a client role.
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM authenticated;
