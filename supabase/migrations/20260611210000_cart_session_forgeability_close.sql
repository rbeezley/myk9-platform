-- Round-18 review (PR #625): close the remaining three cart/session
-- forgeability gaps left after migration 20260611200000.
--
-- 1. INSERT a different item after session creation — not an UPDATE,
--    so the round-17 trigger never fires.
-- 2. DELETE an item and INSERT a same-priced replacement — same net total,
--    different dog/class identity; again bypasses the UPDATE trigger.
-- 3. Sever via the trigger, then PATCH entry_carts.stripe_checkout_session_id
--    back to the old session id — entry_carts_policy is FOR ALL, so the
--    write is allowed by RLS and undoes the sever.
--
-- Fixes:
-- A. Extend cart_item_identity_change_sever_session() to handle DELETE
--    (which exposes OLD but not NEW) and add AFTER INSERT/DELETE triggers.
-- B. Block non-service-role callers from writing a non-null value to
--    entry_carts.stripe_checkout_session_id. NULL writes (the sever
--    direction, done by the store's addItem/removeItem/updateItem/clearCart
--    and by the A triggers above) always pass — only the checkout edge
--    function (running as service_role) may set a live session id.

begin;

-- ---------------------------------------------------------------------------
-- A. Extend the sever function and add INSERT/DELETE triggers.
-- ---------------------------------------------------------------------------

-- The function body grows a TG_OP branch: DELETE exposes OLD, not NEW.
-- For AFTER triggers the return value is ignored; conventions call for
-- returning OLD on DELETE and NEW on INSERT/UPDATE.
create or replace function public.cart_item_identity_change_sever_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
begin
  v_cart_id := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;
  update public.entry_carts
  set stripe_checkout_session_id = null
  where id = v_cart_id
    and stripe_checkout_session_id is not null;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- INSERT trigger: adding an item to a cart that has an open session means
-- the session no longer covers the full cart — sever it.
drop trigger if exists trg_cart_item_insert_sever_session on public.entry_cart_items;

create trigger trg_cart_item_insert_sever_session
  after insert on public.entry_cart_items
  for each row
  execute function public.cart_item_identity_change_sever_session();

-- DELETE trigger: removing an item from a cart with an open session means
-- the session over-charges — sever it.
drop trigger if exists trg_cart_item_delete_sever_session on public.entry_cart_items;

create trigger trg_cart_item_delete_sever_session
  after delete on public.entry_cart_items
  for each row
  execute function public.cart_item_identity_change_sever_session();

-- The UPDATE trigger (trg_cart_item_identity_sever_session) created in
-- migration 20260611200000 picks up the updated function body automatically
-- via CREATE OR REPLACE above; it does not need to be re-created.

-- ---------------------------------------------------------------------------
-- B. Block client writes of a non-null stripe_checkout_session_id.
--    Only the stripe-checkout edge function (service_role) may set it.
--    The store's mutation methods always sever to NULL — those writes pass.
-- ---------------------------------------------------------------------------

create or replace function public.entry_carts_protect_session_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select current_setting('role', true)) = 'service_role' then
    return new;
  end if;
  raise exception
    'stripe_checkout_session_id can only be set by the checkout service'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_entry_carts_protect_session_id on public.entry_carts;

-- WHEN clause: only fires when the caller is trying to set a non-null value.
-- Sever writes (null) always pass; the checkout function (service_role)
-- always passes; any other non-null write is rejected.
create trigger trg_entry_carts_protect_session_id
  before insert or update of stripe_checkout_session_id on public.entry_carts
  for each row
  when (new.stripe_checkout_session_id is not null)
  execute function public.entry_carts_protect_session_id();

commit;
