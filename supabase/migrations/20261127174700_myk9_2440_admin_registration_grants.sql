-- MYK9-2440: grant registration:mark_payment, registration:manage_status and
-- registration:view_all_dogs to the club_admin and site_admin roles.
--
-- PR #4421 removes the second PermissionGuard (components/auth), whose hardcoded mail-in
-- fallback (useRegistrationPermissions) gave staff these three permissions. The guard that
-- stays reads database permissions only, and today only secretaries hold the three codes, so
-- club admins and site admins would lose "Check received", "Cash received", "Paid by a club or
-- group" and the registration status panel. Owner decision (2026-11-27, option a): keep
-- today's behaviour by granting the codes, so the database is the one source of permissions.
--
-- Data only: no table, column, policy or function changes, so no GRANT/REVOKE is needed.
-- Idempotent: re-running adds nothing.

BEGIN;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  JOIN public.permissions p
    ON p.code IN (
      'registration:mark_payment',
      'registration:manage_status',
      'registration:view_all_dogs'
    )
 WHERE r.name IN ('club_admin', 'site_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Fail loudly rather than silently grant nothing if a role or a permission is missing.
DO $$
DECLARE
  v_granted integer;
BEGIN
  SELECT count(*) INTO v_granted
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE p.code IN (
           'registration:mark_payment',
           'registration:manage_status',
           'registration:view_all_dogs'
         )
     AND r.name IN ('club_admin', 'site_admin');
  IF v_granted <> 6 THEN
    RAISE EXCEPTION 'MYK9-2440: expected 6 grants (3 codes x 2 roles), found %', v_granted;
  END IF;
END;
$$;

COMMIT;
