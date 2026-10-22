-- MYK9-1315: tell every active site admin when a non-admin creates a club that
-- is waiting for authorization.
--
-- A club a secretary or club admin creates themselves (the show wizard's "my club
-- isn't listed" path) stays unauthorized until a site admin acts (MYK9-572,
-- MYK9-855, MYK9-1310). The "Clubs awaiting authorization" list on Admin ->
-- Onboarding was the only signal. This adds a sibling AFTER INSERT trigger, not a
-- change to trg_authorize_club_created_by_site_admin (MYK9-1310): a separate concern
-- stays a separate function, and 1310's body is not re-copied.
--
-- Raised from the database so a direct PostgREST insert behaves like the wizard.
-- Seeds and service_role (no auth.uid()) and site admins' own inserts raise
-- nothing. Same-event triggers fire alphabetically, so this fires after the
-- authorize trigger; authorized_at is still re-read by id because NEW is the
-- pre-trigger row.

-- 1. Allow the new type. List copied from 20261007012700_myk9_1021 (latest).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'entry_confirmed', 'q_earned', 'schedule_change', 'judge_assignment',
  'club_access_approved', 'waitlist_auto_offer', 'waitlist_mail_in_head',
  'club_awaiting_authorization'
));

-- 2. The trigger function.
CREATE OR REPLACE FUNCTION public.notify_site_admins_club_awaiting_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creator text;
  v_link text := '/clubs/' || NEW.id;
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
    format('%s was created by %s and is waiting for authorization.', NEW.name, v_creator),
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
  'MYK9-1315: AFTER INSERT ON clubs. When a non-site-admin account inserts a club that is still unauthorized, writes one club_awaiting_authorization in-app notification per active site admin (deep link /clubs/<id>). Seed/service_role inserts (no auth.uid()) and site admins'' own inserts raise nothing.';

-- Trigger-only: fired by the trigger as its owner, never callable by a client role.
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM authenticated;

DROP TRIGGER IF EXISTS trg_notify_club_awaiting_authorization ON public.clubs;
CREATE TRIGGER trg_notify_club_awaiting_authorization
  AFTER INSERT ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_site_admins_club_awaiting_authorization();
