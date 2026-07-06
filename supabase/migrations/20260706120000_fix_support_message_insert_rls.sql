begin;

drop policy if exists "support_ticket_messages_insert_owner_or_site_admin"
  on public.support_ticket_messages;

create policy "support_ticket_messages_insert_owner_or_site_admin"
  on public.support_ticket_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (
        is_from_operator = false
        and exists (
          select 1
          from public.support_tickets t
          where t.id = support_ticket_messages.ticket_id
            and t.owner_id = (select auth.uid())
        )
      )
      or (
        is_from_operator = true
        and (select public.is_site_admin())
        and exists (
          select 1
          from public.support_tickets t
          where t.id = support_ticket_messages.ticket_id
        )
      )
    )
  );

notify pgrst, 'reload schema';

commit;
