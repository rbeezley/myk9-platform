-- Round-17 review (PR #625): sever the checkout-session link when a cart
-- item's identity columns (dog_id, class_id) are mutated via a direct
-- PostgREST write.
--
-- Why this matters: the entry_cart_items_policy (migration 020) is FOR ALL
-- with no column restriction — a cart owner can PATCH dog_id/class_id
-- directly without going through the Zustand store. The store severs
-- stripe_checkout_session_id on every mutation it handles, but the RLS
-- doesn't enforce that invariant. A user could:
--   1. create a checkout session (cart points at it)
--   2. PATCH dog_id/class_id to a same-priced alternative via PostgREST
--   3. pay the original session
--   4. webhook: amount_total matches authoritative pricing (same price),
--      so entries are created for the mutated dog/class, not the item
--      Stripe was actually paid for
--
-- The trigger fires AFTER the PATCH, nulling stripe_checkout_session_id on
-- the parent cart. The webhook's sessionMatchesCart guard then rejects the
-- paid session (cartSessionId is null ≠ session.id) before any entries
-- are created. Cart stays active; operator sees the alert and refunds.
--
-- No application-code change needed: the guard already handles null
-- cartSessionId (see sessionCartGuard.ts line 60 and its test).

begin;

create or replace function public.cart_item_identity_change_sever_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entry_carts
  set stripe_checkout_session_id = null
  where id = new.cart_id
    and stripe_checkout_session_id is not null;
  return new;
end;
$$;

drop trigger if exists trg_cart_item_identity_sever_session on public.entry_cart_items;

create trigger trg_cart_item_identity_sever_session
  after update of dog_id, class_id on public.entry_cart_items
  for each row
  when (
    old.dog_id is distinct from new.dog_id
    or old.class_id is distinct from new.class_id
  )
  execute function public.cart_item_identity_change_sever_session();

commit;
