-- MYK9-1911: self_checkin_entry refuses a stale write.
--
-- A Pull's Undo replayed from a paused mutation queue, or raced from a second device, wrote the
-- prior status over whatever another operator set after the Pull (in-ring back to checked-in).
-- The write now carries the state it expects to replace: p_expected_status (and, for an Undo of a
-- Pull, p_expected_pull_source). When the row no longer matches, nothing is written and the call
-- raises SQLSTATE 55000 with a message starting 'Stale status:'. Both parameters default to NULL,
-- which skips the check, so a caller that sends only (p_entry_id, p_new_status) behaves as before.
--
-- The old (uuid, text) signature is dropped: leaving it beside the new one makes a two-argument
-- call ambiguous. Client and RPC change together; the new function accepts the old call shape.
--
-- Body: 20261108033700_myk9_1757_pull_source.sql (latest definition), with the ownership check
-- moved into a row-locking SELECT so the status compare and the UPDATE see the same row.
-- Grants are re-applied exactly as that migration left them (authenticated only).

drop function if exists public.self_checkin_entry(uuid, text);

create function public.self_checkin_entry(
  p_entry_id uuid,
  p_new_status text,
  p_expected_status text default null,
  p_expected_pull_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_person_id uuid;
  v_current_status text;
  v_current_source text;
  v_found boolean := false;
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

  -- Lock the row the caller may write, so a concurrent status change waits and the compare below
  -- is against the row the UPDATE will replace.
  select true,
         coalesce(e.check_in_status, 'no-status'),
         e.check_in_pulled_by
    into v_found, v_current_status, v_current_source
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

  if not coalesce(v_found, false) then
    raise exception 'Not authorized: caller does not own entry % or self check-in is disabled', p_entry_id;
  end if;

  if (p_expected_status is not null and v_current_status is distinct from p_expected_status)
     or (p_expected_pull_source is not null and v_current_source is distinct from p_expected_pull_source)
  then
    raise exception 'Stale status: entry % is no longer in the state this change expected', p_entry_id
      using errcode = '55000';
  end if;

  -- MYK9-1757: this write is the exhibitor's own. The trigger reads the setting.
  perform set_config('myk9.pull_source', 'exhibitor', true);

  update public.entries
     set check_in_status = p_new_status,
         updated_at = now()
   where id = p_entry_id;

  -- Reset before anything else in this transaction can write entries as staff.
  perform set_config('myk9.pull_source', '', true);
end;
$func$;

comment on function public.self_checkin_entry(uuid, text, text, text) is
  'MYK9-1911: exhibitor check-in write. Optional p_expected_status / p_expected_pull_source make it refuse (SQLSTATE 55000, message "Stale status: ...", nothing written) when the entry no longer matches, so a replayed or raced Pull Undo cannot overwrite a newer status.';

revoke all on function public.self_checkin_entry(uuid, text, text, text) from public, anon;
grant execute on function public.self_checkin_entry(uuid, text, text, text) to authenticated;
