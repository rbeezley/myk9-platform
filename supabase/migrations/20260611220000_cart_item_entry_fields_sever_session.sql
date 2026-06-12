-- Round-19 review (PR #625): sever the checkout-session link when non-identity
-- entry fields (handler_id, jump_height, special_requests) are mutated via a
-- direct PostgREST write.
--
-- Migrations 20260611200000 and 20260611210000 already sever on UPDATE of
-- dog_id/class_id and on any INSERT/DELETE. handler_id, jump_height, and
-- special_requests were not covered — but buildEntryInsert stamps all three
-- onto the entry row, so a direct PATCH to these columns after checkout
-- started would create entries with values the Stripe session never saw.
-- Same attack surface, lower fraud upside than identity swaps, but still
-- data-integrity gap (wrong handler/height stamped on a paid entry with no
-- operator alert).
--
-- The existing cart_item_identity_change_sever_session() function already does
-- what we need; this migration adds a second UPDATE trigger for the remaining
-- entry-relevant columns.

begin;

drop trigger if exists trg_cart_item_entry_fields_sever_session on public.entry_cart_items;

create trigger trg_cart_item_entry_fields_sever_session
  after update of handler_id, jump_height, special_requests on public.entry_cart_items
  for each row
  when (
    old.handler_id is distinct from new.handler_id
    or old.jump_height is distinct from new.jump_height
    or old.special_requests is distinct from new.special_requests
  )
  execute function public.cart_item_identity_change_sever_session();

commit;
