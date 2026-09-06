-- Recovered cart items carry entry_id as part of their checkout identity.
-- Mutating it must invalidate an existing Stripe session just like changing
-- dog_id or class_id, otherwise sessionMatchesCart can accept a changed line.

begin;

drop trigger if exists trg_cart_item_identity_sever_session on public.entry_cart_items;

create trigger trg_cart_item_identity_sever_session
  after update of dog_id, class_id, entry_id on public.entry_cart_items
  for each row
  when (
    old.dog_id is distinct from new.dog_id
    or old.class_id is distinct from new.class_id
    or old.entry_id is distinct from new.entry_id
  )
  execute function public.cart_item_identity_change_sever_session();

commit;
