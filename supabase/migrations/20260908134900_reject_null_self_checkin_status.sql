-- A NULL status must not bypass self-check-in's allowed-status whitelist.
-- `NULL = ANY(...)` evaluates to NULL, which does not enter a PL/pgSQL IF.

create or replace function public.self_checkin_entry(
  p_entry_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_person_id uuid;
  v_allowed_statuses text[] := array[
    'checked-in', 'conflict', 'pulled', 'at-gate', 'no-status'
  ];
begin
  if p_new_status is null or not p_new_status = any(v_allowed_statuses) then
    raise exception 'Status % is not allowed for self-check-in', p_new_status;
  end if;

  select p.id
    into v_person_id
    from public.people p
   where p.auth_user_id = (select auth.uid())
   limit 1;

  if v_person_id is null then
    raise exception 'Not authorized: caller is not linked to a person record';
  end if;

  update public.entries e
     set check_in_status = p_new_status,
         updated_at = now()
    from public.dogs d
    left join public.classes c on c.id = e.class_id
    left join public.trials t on t.id = coalesce(c.trial_id, e.trial_id)
    left join public.show_visibility_settings show_vis
      on show_vis.show_id = coalesce(e.show_id, t.show_id)
    left join public.trial_visibility_overrides trial_vis
      on trial_vis.trial_id = coalesce(c.trial_id, e.trial_id)
    left join public.class_visibility_overrides class_vis
      on class_vis.class_id = e.class_id
   where e.id = p_entry_id
     and d.id = e.dog_id
     and (
       e.handler_id = v_person_id
       or d.owner_id = v_person_id
       or d.co_owner_id = v_person_id
     )
     and coalesce(
       class_vis.self_checkin_enabled,
       trial_vis.self_checkin_enabled,
       show_vis.self_checkin_enabled,
       true
     );

  if not found then
    raise exception 'Not authorized: caller does not own entry % or self check-in is disabled', p_entry_id;
  end if;
end;
$func$;

revoke all on function public.self_checkin_entry(uuid, text) from public, anon;
grant execute on function public.self_checkin_entry(uuid, text) to authenticated;
