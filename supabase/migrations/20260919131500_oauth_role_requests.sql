begin;

-- OAuth providers create the auth user before the browser returns to the app,
-- so signup metadata cannot reach handle_new_user in time. This authenticated
-- RPC materializes only the same non-granting role requests as the email
-- signup trigger. Approval is still required before any role is assigned.
create or replace function public.submit_signup_role_requests(p_intended_roles jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_role text;
  v_requested_role text;
begin
  if auth.uid() is null or jsonb_typeof(p_intended_roles) <> 'array' then
    return;
  end if;

  select id into v_person_id
  from public.people
  where auth_user_id = auth.uid()
  limit 1;

  if v_person_id is null then
    return;
  end if;

  for v_role in select jsonb_array_elements_text(p_intended_roles)
  loop
    v_requested_role := case v_role
      when 'club_officer' then 'club_admin'
      when 'secretary' then 'secretary'
      else null
    end;

    if v_requested_role is not null then
      insert into public.role_requests (
        auth_user_id,
        person_id,
        requested_role,
        requested_scope,
        requester_note
      ) values (
        auth.uid(),
        v_person_id,
        v_requested_role,
        'club',
        'Created from OAuth signup role intent.'
      )
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.submit_signup_role_requests(jsonb) from public, anon;
grant execute on function public.submit_signup_role_requests(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
