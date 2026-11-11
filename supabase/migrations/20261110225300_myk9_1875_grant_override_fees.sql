-- MYK9-1875: grant registration:override_fees to the secretary, club_admin and site_admin roles.
--
-- Migration 20260904190000 defined the permission and left assigning it as a separate
-- decision; no role held it, so the app's database-first permission check hid the
-- late-entry "Paid by cash or check" / "Make free" card and the "Free entry" payment option
-- from everyone. Owner decision (2026-11-10): the show secretary and the club admin take
-- late entries at the table and should see them; site admins too (owner, 2026-11-11), since the
-- server already treats them as an official of every show.
--
-- Data only: no table, column, policy or function changes, so no GRANT/REVOKE is needed.
-- Idempotent: re-running adds nothing.

BEGIN;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  JOIN public.permissions p ON p.code = 'registration:override_fees'
 WHERE r.name IN ('secretary', 'club_admin', 'site_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Fail loudly rather than silently grant nothing if a role or the permission is missing.
DO $$
DECLARE
  v_granted integer;
BEGIN
  SELECT count(*) INTO v_granted
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE p.code = 'registration:override_fees'
     AND r.name IN ('secretary', 'club_admin', 'site_admin');
  IF v_granted <> 3 THEN
    RAISE EXCEPTION 'MYK9-1875: expected 3 grants of registration:override_fees, found %', v_granted;
  END IF;
END;
$$;

COMMIT;
