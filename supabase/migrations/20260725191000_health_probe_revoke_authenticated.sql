-- Revoke EXECUTE on system_health_probe() from `authenticated` — MYK9-93 follow-up.
--
-- The function's ACL on the applied database reads:
--   postgres=X/postgres | service_role=X/postgres | authenticated=X/postgres
--
-- The `authenticated` grant is not intentional. It arrived from the project's
-- ALTER DEFAULT PRIVILEGES when the function was first created (20260704130000) and
-- survived every later revision: each one does `revoke all ... from public` — which
-- only clears the PUBLIC pseudo-role — and `create or replace function` PRESERVES the
-- existing ACL rather than resetting it. So the intended "service_role only" access
-- documented in that migration's header has never actually held.
--
-- It matters more now. 20260725190000 added the anon_grants block, so the probe returns
-- a complete map of which tables and columns are reachable without authentication —
-- useful reconnaissance, and readable by any signed-in user. The runner (cron-health-check)
-- calls this as service_role and is unaffected.
--
-- Same class of trap as the one MYK9-93 exists to fix: a default privilege quietly
-- granting more than the migration text appears to.

begin;

revoke all on function public.system_health_probe() from authenticated;
revoke all on function public.system_health_probe() from anon;
revoke all on function public.system_health_probe() from public;

grant execute on function public.system_health_probe() to service_role;

commit;

notify pgrst, 'reload schema';
