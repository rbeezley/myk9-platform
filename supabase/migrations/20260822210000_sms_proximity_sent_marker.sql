-- MYK9-193: exactly-once marker for the ring-proximity SMS.
--
-- push-trigger-run-proximity re-evaluates the whole class queue on every
-- transition into the ring, so one entry currently produces one push per
-- position in the countdown — three at the default lead_dogs, ten if the user
-- raises it. That is fine for push, which is free. For SMS it is a 3x-plus
-- multiplier against a Low Volume Mixed campaign capped near 2,000 messages a
-- day brand-wide (MYK9-190), so push keeps the countdown and SMS fires once.
--
-- WHY A MARKER RATHER THAN A POSITIONAL TEST. The cheap alternative is "send
-- only when dogsAhead = leadDogs - 1", which needs no schema at all. It is
-- exactly-once only while the queue advances monotonically by one: a pulled
-- entry restored, a mid-class run-order edit, or two dogs scored between two
-- invocations either skips that index (no SMS at all) or revisits it (a second
-- SMS). A duplicate now costs money and campaign headroom, so the recorded
-- approach was chosen deliberately (issue decision, option 2).
--
-- The marker is claimed BEFORE the provider call and released if that call
-- fails, so a provider outage does not permanently consume an entry's one
-- allowed message.

begin;

create table if not exists public.sms_proximity_sends (
  -- FK to auth.users matches every other auth_user_id column in this schema.
  -- Without it, deleting an account orphans its markers: they are keyed on
  -- entry_id too, so the entry cascade clears them only when the ENTRY goes,
  -- not when the account goes while the entry survives.
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (auth_user_id, entry_id)
);

comment on table public.sms_proximity_sends is
  'One row per (account, entry) that has been sent a ring-proximity SMS. The primary key IS the idempotency guarantee — push still sends the full countdown, SMS sends once. Rows disappear with the entry; older rows are pruned by the claim function.';
comment on column public.sms_proximity_sends.sent_at is
  'When the send was claimed, not when the carrier delivered. Used only for pruning.';

create index if not exists sms_proximity_sends_sent_at_idx
  on public.sms_proximity_sends (sent_at);

alter table public.sms_proximity_sends enable row level security;
alter table public.sms_proximity_sends force row level security;

-- Service-role only: the only writer is the run-proximity trigger, and no
-- client has any reason to read who was texted. Stated as an explicit REVOKE
-- because this project carries ALTER DEFAULT PRIVILEGES granting anon full CRUD
-- on newly created public tables — omitting a grant does not keep anon out.
revoke all on table public.sms_proximity_sends from public, anon, authenticated;
grant select, insert, delete on table public.sms_proximity_sends to service_role;

-- Explicit deny-all rather than relying on "RLS enabled with no policies": the
-- disposition is then visible in the SQL and still holds if a later migration
-- grants a client role by accident. service_role bypasses RLS, and the claim
-- function below is SECURITY DEFINER, so neither path is affected.
create policy sms_proximity_sends_deny_all
  on public.sms_proximity_sends
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Claim: true exactly once per (account, entry). ON CONFLICT DO NOTHING makes
-- the check and the write one atomic step, so two concurrent invocations of the
-- trigger — two dogs scored at once in the same ring — cannot both win.
create or replace function public.claim_sms_proximity_send(
  p_auth_user_id uuid,
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed_entry_id uuid;
begin
  if p_auth_user_id is null or p_entry_id is null then
    return false;
  end if;

  -- Opportunistic pruning. An entry's marker is only meaningful while that
  -- entry is still running today; the cascades clear the rest.
  --
  -- This runs on every claim, including the far more common already-claimed
  -- path, which puts an index scan on a paid-send hot path. Measured against
  -- real volume that is the right trade: a 200-exhibitor day at the default
  -- lead_dogs is on the order of 600 claims, the predicate is covered by
  -- sms_proximity_sends_sent_at_idx, and the deletes touch disjoint rows so
  -- there is no meaningful lock contention. Revisit — probabilistic guard, or
  -- a pg_cron job — only if claim volume grows by orders of magnitude.
  delete from public.sms_proximity_sends
  where sent_at < pg_catalog.now() - interval '30 days';

  insert into public.sms_proximity_sends (auth_user_id, entry_id)
  values (p_auth_user_id, p_entry_id)
  on conflict (auth_user_id, entry_id) do nothing
  returning entry_id into v_claimed_entry_id;

  return v_claimed_entry_id is not null;
end;
$$;

-- Release: undo a claim whose provider call failed, so the exhibitor still gets
-- their one text on the next transition rather than losing it to an outage.
create or replace function public.release_sms_proximity_send(
  p_auth_user_id uuid,
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released_entry_id uuid;
begin
  if p_auth_user_id is null or p_entry_id is null then
    return false;
  end if;

  delete from public.sms_proximity_sends
  where auth_user_id = p_auth_user_id
    and entry_id = p_entry_id
  returning entry_id into v_released_entry_id;

  return v_released_entry_id is not null;
end;
$$;

-- EXECUTE decision, stated rather than inherited. Both functions write the
-- record that decides whether a paid message goes out, so no API role holds
-- EXECUTE: a client that could call release_sms_proximity_send could force a
-- duplicate send, and one that could call claim_sms_proximity_send could
-- suppress somebody else's alert.
revoke all on function public.claim_sms_proximity_send(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_sms_proximity_send(uuid, uuid)
  to service_role;
revoke all on function public.release_sms_proximity_send(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_sms_proximity_send(uuid, uuid)
  to service_role;

commit;

notify pgrst, 'reload schema';
