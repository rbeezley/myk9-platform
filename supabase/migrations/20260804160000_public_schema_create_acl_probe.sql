-- MYK9-151 / SA-027 — monitor the accepted SECURITY DEFINER search_path dependency.
--
-- The current accepted-risk decision keeps the legacy SECURITY DEFINER functions
-- that pin search_path to public. Their safety depends on API roles not being able
-- to create shadow objects in public. Keep that dependency observable in the same
-- daily health snapshot that already monitors applied ACL drift.

begin;

revoke create on schema public from anon, authenticated, service_role;

create or replace function public.public_schema_create_acl_probe()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with role_facts as (
    select
      role_name,
      pg_catalog.has_schema_privilege(role_name, 'public', 'CREATE') as can_create
    from pg_catalog.unnest(
      array['anon', 'authenticated', 'service_role']::text[]
    ) as roles(role_name)
  )
  select pg_catalog.jsonb_build_object(
    'schema', 'public',
    'roles', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'role', role_name,
          'can_create', can_create
        )
        order by role_name
      ),
      '[]'::jsonb
    ),
    'violations', coalesce(
      pg_catalog.jsonb_agg(role_name order by role_name)
        filter (where can_create),
      '[]'::jsonb
    )
  )
  from role_facts;
$$;

comment on function public.public_schema_create_acl_probe() is
  'MYK9-151 SA-027: read-only service-role probe for CREATE privileges on the public schema. The daily health runner fails if anon, authenticated, or service_role can create public-schema objects, which would invalidate the accepted SECURITY DEFINER search_path risk decision.';

revoke all on function public.public_schema_create_acl_probe() from public;
revoke execute on function public.public_schema_create_acl_probe() from anon;
revoke execute on function public.public_schema_create_acl_probe() from authenticated;
grant execute on function public.public_schema_create_acl_probe() to service_role;

commit;

notify pgrst, 'reload schema';
