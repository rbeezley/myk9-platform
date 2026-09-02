create or replace function public.create_support_ticket(
  p_owner_id uuid,
  p_subject text,
  p_diagnostics jsonb,
  p_show_id uuid,
  p_is_show_day_priority boolean,
  p_body text
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  if auth.uid() is distinct from p_owner_id and not public.is_site_admin() then
    raise exception 'Not allowed to create a ticket for another user';
  end if;

  insert into public.support_tickets (
    owner_id, subject, status, diagnostics, show_id, is_show_day_priority
  ) values (
    p_owner_id, p_subject, 'open', p_diagnostics, p_show_id, p_is_show_day_priority
  ) returning support_tickets.id into v_ticket_id;

  insert into public.support_ticket_messages (
    ticket_id, sender_id, body, is_from_operator
  ) values (v_ticket_id, p_owner_id, p_body, false);

  return query select v_ticket_id;
end;
$$;

revoke all on function public.create_support_ticket(uuid, text, jsonb, uuid, boolean, text) from public;
grant execute on function public.create_support_ticket(uuid, text, jsonb, uuid, boolean, text) to authenticated;
