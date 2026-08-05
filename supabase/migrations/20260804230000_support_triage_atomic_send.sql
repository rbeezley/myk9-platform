-- MYK9-135: make the support-triage auto-send guard atomic.
--
-- `sendOperatorReply` in scripts/support-triage/gateway.ts was check-then-insert:
-- it re-read the thread, evaluated the guard, and then inserted, with two network
-- round-trips of window in between. Anything that changed the ticket inside that
-- window — a human operator answering from the inbox, resolving the ticket, or a
-- second worker — was invisible to the guard, and the result was a duplicate or
-- inappropriate operator message on a real exhibitor's ticket.
--
-- This function collapses the check and the insert into one statement, gated on
-- the id of the exhibitor message the caller believes is newest. The caller keeps
-- its in-process carve-out guard (that decision needs the message bodies, and it
-- must stay in TypeScript alongside the regex it shares with the drafting path);
-- what moves into the database is the ordering decision, which is the only part
-- that can be raced.
--
-- SECURITY INVOKER, deliberately, against the SECURITY DEFINER wording on the
-- issue. The single caller is the triage worker holding the service-role key, so
-- a definer function would buy no access it does not already have while adding an
-- escalation surface for every future grantee. Invoker keeps RLS in force if this
-- is ever granted more widely.

begin;

create or replace function public.support_triage_send_operator_reply(
  p_ticket_id uuid,
  p_sender_id uuid,
  p_body text,
  p_expected_last_message_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket_status text;
  v_inserted_id uuid;
begin
  -- Serialises auto-send callers against each other on this ticket: a second
  -- worker that read the same "latest" message queues here and re-evaluates the
  -- guard below only after the first has committed. A human operator writing
  -- from the inbox does not take this lock, so it does not serialise against
  -- them — for that path the protection is that the check and the insert are one
  -- statement, which narrows the window from two network round-trips to the
  -- duration of a single insert.
  select t.status
  into v_ticket_status
  from public.support_tickets t
  where t.id = p_ticket_id
  for update;

  -- Ticket deleted, or closed by an operator while we were classifying. Either
  -- way this reply is no longer wanted; answering a resolved ticket would also
  -- silently re-open it.
  if v_ticket_status is null or v_ticket_status not in ('open', 'waiting') then
    return false;
  end if;

  -- The whole guard, as one statement. The insert happens only if the message
  -- the caller read is still on this ticket, still the exhibitor's, and still
  -- has nothing after it. `>=` rather than `>` on the tiebreak is deliberate:
  -- two messages sharing a created_at are ambiguous about which is newest, and
  -- an ambiguous thread must not receive an automated answer.
  insert into public.support_ticket_messages (ticket_id, sender_id, body, is_from_operator)
  select p_ticket_id, p_sender_id, p_body, true
  from public.support_ticket_messages expected
  where expected.id = p_expected_last_message_id
    and expected.ticket_id = p_ticket_id
    and expected.is_from_operator = false
    and not exists (
      select 1
      from public.support_ticket_messages newer
      where newer.ticket_id = p_ticket_id
        and newer.id <> expected.id
        and newer.created_at >= expected.created_at
    )
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return false;
  end if;

  -- Mirrors postSupportTicketMessage in the inbox, which sets 'waiting' after an
  -- operator reply. Without this an auto-answered ticket stays 'open' and keeps
  -- counting toward same-show cluster alerts. updated_at is left to
  -- trg_set_support_ticket_updated_at.
  update public.support_tickets
  set status = 'waiting'
  where id = p_ticket_id;

  return true;
end;
$$;

comment on function public.support_triage_send_operator_reply(uuid, uuid, text, uuid) is
  'MYK9-135. Inserts a support-triage auto-send reply only if p_expected_last_message_id is still the newest message on an open ticket. Returns whether it inserted. Service-role only; the body must be operator-authored canned text, never model output.';

-- The triage worker is the only caller and it authenticates with the service-role
-- key. Nobody else — not anon, not authenticated, not PUBLIC — may write an
-- operator-authored message through this path. anon and authenticated are named
-- explicitly rather than left to the PUBLIC revoke: migrationGrantDecisionContract
-- requires every new public function to state a disposition for both API roles,
-- and "we assumed PUBLIC covered it" is exactly the reasoning that guard exists
-- to reject.
revoke all on function public.support_triage_send_operator_reply(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.support_triage_send_operator_reply(uuid, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
