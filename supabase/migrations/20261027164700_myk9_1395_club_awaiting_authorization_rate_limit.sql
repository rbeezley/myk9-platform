-- MYK9-1395 (SA-2026-10-24-04): bound the MYK9-1315 club-awaiting-authorization
-- notice. clubs_insert lets any active secretary or club admin insert clubs
-- (MYK9-572), and this SECURITY DEFINER trigger wrote one notification per site
-- admin per club with the caller-supplied name, so N inserts meant N rows per
-- admin of attacker-controlled text.
--
-- Changes against 20261022013700 (the latest definition; body copied from it):
--   1. One notice set per creator per 24 hours, claimed atomically in a ledger the
--      caller cannot touch (private.club_awaiting_authorization_notice_log). The
--      claim runs AFTER the early returns (no auth.uid(), site admin, already
--      authorized), so those never consume the window.
--   2. The interpolated name is capped at 80 characters (ellipsis when cut).
-- Why not "skip while another club of this creator is still pending": that rule
-- keyed on caller-controlled state. A club can be INSERTed with deleted_at already
-- set (trg_00_block_direct_soft_delete is BEFORE UPDATE only), and created_by can
-- be cleared afterwards, so either reset the limit without a site admin; and two
-- concurrent transactions each saw no sibling and each notified. The ledger is
-- written only by this function, and INSERT .. ON CONFLICT DO UPDATE takes the
-- row lock, so concurrent inserts by one creator serialise and exactly one wins
-- the claim (the loser re-checks last_notified_at after the winner commits).
-- A multi-row INSERT notifies once: the first row claims, later rows skip.
-- A suppressed notice hides nothing: Admin -> Onboarding lists every pending club.
-- Trigger definition and notifications_type_check are untouched.

CREATE TABLE IF NOT EXISTS private.club_awaiting_authorization_notice_log (
  creator uuid PRIMARY KEY,
  last_notified_at timestamptz NOT NULL
);
-- No FK to auth.users on purpose: a deleted account must not be blocked by, or
-- cascade into, the ledger. No sequence, no trigger.
ALTER TABLE private.club_awaiting_authorization_notice_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.club_awaiting_authorization_notice_log FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE private.club_awaiting_authorization_notice_log IS
  'MYK9-1395: last time a club_awaiting_authorization notice set was raised for this creator (auth uid). Written only by notify_site_admins_club_awaiting_authorization() (SECURITY DEFINER); RLS on with no policies and no client grants.';

CREATE OR REPLACE FUNCTION public.notify_site_admins_club_awaiting_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creator text;
  v_claimed integer;
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

  -- MYK9-1395: atomic once-per-24h claim per creator. The ON CONFLICT row lock
  -- serialises concurrent inserts; only one gets a row back.
  INSERT INTO private.club_awaiting_authorization_notice_log AS l (creator, last_notified_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (creator) DO UPDATE SET last_notified_at = EXCLUDED.last_notified_at
    WHERE l.last_notified_at <= now() - interval '24 hours'
  RETURNING 1 INTO v_claimed;
  IF v_claimed IS NULL THEN
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
  'MYK9-1315/MYK9-1395: AFTER INSERT ON clubs. When a non-site-admin account inserts a club that is still unauthorized, writes one club_awaiting_authorization in-app notification per active site admin (deep link /clubs/<id>). At most one notice set per creator per 24 hours (ledger private.club_awaiting_authorization_notice_log); the club name is capped at 80 characters. Seed/service_role inserts (no auth.uid()) and site admins'' own inserts raise nothing.';

-- Trigger-only: fired by the trigger as its owner, never callable by a client role.
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM authenticated;
