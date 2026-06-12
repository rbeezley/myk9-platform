-- Round-20 review (PR #625): two remaining cart-forgeability gaps.
--
-- P1a: status regression — entry_carts_policy is FOR ALL, so an owner can
-- PATCH a paid cart back to status='active'. stripe-checkout accepts active
-- carts, creates a new session, and the webhook claims it again, inserting
-- duplicate paid entries. The existing protect_session_id guard only blocks
-- non-null session writes, not the status change that re-opens the latch.
--
-- P1b: cart_id reparenting — entry_cart_items_policy is FOR ALL, so an owner
-- can PATCH an item's cart_id, moving it into a different cart that already
-- has an open session. None of the INSERT/DELETE/UPDATE triggers fire (this is
-- an UPDATE to an existing row, changing its parent). The webhook then builds
-- an entry for the reparented item at authoritative pricing while the payer
-- only actually paid for the original cart's contents.
--
-- Fixes:
-- A. BEFORE UPDATE OF status trigger on entry_carts rejects non-service-role
--    writes that: (a) touch a submitted cart, or (b) regress any cart back
--    to active. The store's abandonCart (active → abandoned) is unaffected;
--    the checkout and webhook functions run as service_role and always pass.
-- B. BEFORE UPDATE OF cart_id trigger on entry_cart_items blocks cart_id
--    changes from non-service-role entirely. Items are never legitimately
--    re-parented; the correct operation is delete + insert in the new cart,
--    which the existing triggers already handle.

begin;

-- ---------------------------------------------------------------------------
-- A. Block status regressions and submitted-cart mutations.
-- ---------------------------------------------------------------------------

create or replace function public.entry_carts_protect_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select current_setting('role', true)) = 'service_role' then
    return new;
  end if;
  -- Paid cart: service_role owns all further state changes.
  if old.status = 'submitted' then
    raise exception
      'submitted cart status cannot be changed by non-service-role callers'
      using errcode = '42501';
  end if;
  -- Regression to active from any terminal state re-opens the idempotency
  -- latch — block for all non-service-role callers.
  if new.status = 'active' then
    raise exception
      'cart status cannot regress to active'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_entry_carts_protect_status on public.entry_carts;

create trigger trg_entry_carts_protect_status
  before update of status on public.entry_carts
  for each row
  when (old.status is distinct from new.status)
  execute function public.entry_carts_protect_status();

-- ---------------------------------------------------------------------------
-- B. Block cart_id reparenting on cart items.
-- ---------------------------------------------------------------------------

create or replace function public.entry_cart_items_protect_cart_id()
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
    'entry_cart_items.cart_id cannot be changed — delete and re-insert in the target cart'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_entry_cart_items_protect_cart_id on public.entry_cart_items;

create trigger trg_entry_cart_items_protect_cart_id
  before update of cart_id on public.entry_cart_items
  for each row
  when (old.cart_id is distinct from new.cart_id)
  execute function public.entry_cart_items_protect_cart_id();

commit;
