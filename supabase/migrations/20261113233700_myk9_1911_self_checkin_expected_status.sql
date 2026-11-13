-- MYK9-1911: server half of MYK9-1880. A Pull's Undo replayed late (or raced from a second
-- device) must not overwrite a newer status. self_checkin_entry gains two OPTIONAL expectations:
-- the status the write expects to replace and, for a Pull Undo, who made that Pull. When the row
-- no longer matches, the RPC raises SQLSTATE MK911 and changes nothing. Callers that pass
-- neither behave exactly as before.
--
-- Body copied from the latest definition (20261108033700_myk9_1757_pull_source.sql). The only
-- change: the ownership/visibility check moved from the UPDATE's WHERE into a locking SELECT, so
-- the expectation is compared against a row the caller is allowed to touch (a non-owner still
-- gets the "Not authorized" refusal and learns nothing about the row), then a plain UPDATE by id.
--
-- Signature change: the old (uuid, text) overload is DROPPED, not kept. Two overloads would make
-- a two-argument PostgREST call ambiguous; the new one has defaults, so two-argument callers
-- resolve to it. EXECUTE is re-granted exactly as the old overload was: not public/anon,
-- authenticated only.

drop function if exists public.self_checkin_entry(uuid, text);

create or replace function public.self_checkin_entry(
  p_entry_id uuid,
  p_new_status text,
  p_expected_status text default null,
  p_expected_pull_source text default null,
  p_expected_version integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_person_id uuid;
  v_current_status text;
  v_current_pull_source text;
  v_current_version integer;
  v_new_version integer;
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

  -- Lock the row the caller may touch (ownership + self check-in visibility, unchanged).
  select e.check_in_status, e.check_in_pulled_by, e.version
    into v_current_status, v_current_pull_source, v_current_version
    from public.entries e
   where e.id = p_entry_id
     and exists (
       select 1
       from public.dogs d
       left join public.classes c on c.id = e.class_id
       left join public.trials t on t.id = coalesce(c.trial_id, e.trial_id)
       left join public.show_visibility_settings show_vis
         on show_vis.show_id = coalesce(e.show_id, t.show_id)
       left join public.trial_visibility_overrides trial_vis
         on trial_vis.trial_id = coalesce(c.trial_id, e.trial_id)
       left join public.class_visibility_overrides class_vis
         on class_vis.class_id = e.class_id
       where d.id = e.dog_id
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
         )
     )
     for update of e;

  if not found then
    raise exception 'Not authorized: caller does not own entry % or self check-in is disabled', p_entry_id;
  end if;

  if (p_expected_status is not null and v_current_status is distinct from p_expected_status)
     or (p_expected_pull_source is not null
         and v_current_pull_source is distinct from p_expected_pull_source)
     or (p_expected_version is not null and v_current_version is distinct from p_expected_version) then
    raise exception 'Entry % status changed since this write was prepared', p_entry_id
      using errcode = 'MK911';
  end if;

  -- MYK9-1757: this write is the exhibitor's own. The trigger reads the setting.
  perform set_config('myk9.pull_source', 'exhibitor', true);

  update public.entries e
     set check_in_status = p_new_status,
         updated_at = now()
   where e.id = p_entry_id
  returning e.version into v_new_version;

  -- Reset before anything else in this transaction can write entries as staff.
  perform set_config('myk9.pull_source', '', true);

  return v_new_version;
end;
$func$;

revoke all on function public.self_checkin_entry(uuid, text, text, text, integer) from public, anon;
grant execute on function public.self_checkin_entry(uuid, text, text, text, integer) to authenticated;
