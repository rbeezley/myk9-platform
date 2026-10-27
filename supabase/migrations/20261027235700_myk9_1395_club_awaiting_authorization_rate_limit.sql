-- MYK9-1395 (SA-2026-10-24-04): bound the MYK9-1315 club-awaiting-authorization
-- notice. clubs_insert lets any active secretary or club admin insert clubs
-- (MYK9-572), and this SECURITY DEFINER trigger wrote one notification per site
-- admin per club with the caller-supplied name, so N inserts meant N rows per
-- admin of attacker-controlled text.
--
-- Changes against 20261022013700 (the latest definition):
--   1. FOLD, don't drop: exactly one club_awaiting_authorization row per active
--      site admin per creator, deep link /admin/onboarding?creator=<auth uid>.
--      A repeat insert by the same creator REPLACES that row with a new one (new
--      id, message names the latest club, unread, current created_at) so it
--      resurfaces: reusing the id let a client that already showed it ignore the
--      update, and a stale mark-read by id consume the new club's notice (Codex
--      round 3). The bound is one row per admin per creator,
--      forever, kept current. Rows written by the old trigger (/clubs/<id>) are
--      left alone.
--   2. pg_advisory_xact_lock keyed on the creator serialises concurrent inserts
--      by one creator, so two transactions cannot both find "no row" and both
--      insert. Concurrency is covered by the lock, not exercised by the test.
--   3. The interpolated name is capped at 80 characters (ellipsis when cut); the
--      folded message carries no count, since a count would be derived from
--      caller-controlled data.
-- History of rejected designs: a "skip while another club is pending" rule keyed
-- on caller-controlled state (a club can be INSERTed with deleted_at set, since
-- trg_00_block_direct_soft_delete is BEFORE UPDATE only, and created_by can be
-- cleared) and raced under concurrency; a per-creator 24h ledger table dropped a
-- second club inside the window with no notice and no reminder (Codex round 2
-- P2), and the owner chose fold-don't-drop. No ledger table exists. Nothing here
-- reads club state except the existing "already authorized" check.
-- Admin -> Onboarding lists every pending club, so the single row hides nothing.
-- Trigger definition and notifications_type_check are untouched.

CREATE OR REPLACE FUNCTION public.notify_site_admins_club_awaiting_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creator text;
  v_admin uuid;
  v_link text;
  v_folded boolean;
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

  -- One writer per creator at a time, so the find-or-insert below cannot race.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('myk9-1395:club-notice:' || auth.uid()::text, 0)
  );

  v_link := '/admin/onboarding?creator=' || auth.uid()::text;

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

  FOR v_admin IN
    SELECT DISTINCT p.auth_user_id
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
  LOOP
    -- Replace, never update in place: the folded notice gets a NEW id, so a
    -- client already showing the old id renders it as new, and acknowledging
    -- the old alert (mark-read by id) cannot consume this one (Codex round 3).
    DELETE FROM public.notifications n
    WHERE n.user_id = v_admin
      AND n.type = 'club_awaiting_authorization'
      AND n.deep_link_url = v_link;
    v_folded := FOUND;

    INSERT INTO public.notifications (user_id, type, message, deep_link_url)
    VALUES (
      v_admin,
      'club_awaiting_authorization',
      CASE WHEN v_folded
        THEN format('%s created clubs waiting for authorization, latest: %s.', v_creator, v_name)
        ELSE format('%s was created by %s and is waiting for authorization.', v_name, v_creator)
      END,
      v_link
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_site_admins_club_awaiting_authorization() IS
  'MYK9-1315/MYK9-1395: AFTER INSERT ON clubs. When a non-site-admin account inserts a club that is still unauthorized, writes one club_awaiting_authorization in-app notification per active site admin (the per-club /clubs/<id> link is no longer written). One notification row per active site admin per creator, replaced by a new unread row naming the latest club on each further club (deep link /admin/onboarding?creator=<uid>); the club name is capped at 80 characters. Seed/service_role inserts (no auth.uid()) and site admins'' own inserts raise nothing.';

-- Trigger-only: fired by the trigger as its owner, never callable by a client role.
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.notify_site_admins_club_awaiting_authorization() FROM authenticated;
