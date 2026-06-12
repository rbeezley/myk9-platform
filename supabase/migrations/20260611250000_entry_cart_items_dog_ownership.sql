-- Round-21 review (PR #625): entry_cart_items_policy WITH CHECK only verifies
-- that the cart belongs to the caller. It does not verify that dog_id belongs
-- to the caller, so any authenticated user can add someone else's dog to their
-- cart, pay, and create an entry for that dog under their exhibitor profile.
--
-- Fix: extend the WITH CHECK clause to require that dog_id belongs to the
-- caller's person (owner OR co-owner), using the same get_my_person_id()
-- pattern established in other RLS policies.
--
-- The USING clause is unchanged: exhibitors can still read all their cart items
-- (including any legacy rows). Only new writes are restricted.
--
-- Note: the USING clause also stays at cart-owner level (read your own items).
-- Professional handlers are not expected to use the cart/checkout flow —
-- secretary-direct entries bypass carts entirely.

begin;

drop policy if exists "entry_cart_items_policy" on public.entry_cart_items;

create policy "entry_cart_items_policy" on public.entry_cart_items
  for all to public
  using (
    has_role('platform_admin'::text)
    or (cart_id in (
      select ec.id
      from entry_carts ec
      join exhibitor_profiles ep on ep.id = ec.exhibitor_id
      where ep.auth_user_id = (select auth.uid())
    ))
  )
  with check (
    has_role('platform_admin'::text)
    or (
      -- cart must belong to the caller
      cart_id in (
        select ec.id
        from entry_carts ec
        join exhibitor_profiles ep on ep.id = ec.exhibitor_id
        where ep.auth_user_id = (select auth.uid())
      )
      -- dog must belong to the caller (owner or co-owner)
      and dog_id in (
        select d.id
        from public.dogs d
        where d.owner_id    = (select public.get_my_person_id())
           or d.co_owner_id = (select public.get_my_person_id())
      )
    )
  );

notify pgrst, 'reload schema';

commit;
