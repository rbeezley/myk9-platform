-- Recovered Finish Payment carts represent existing unpaid entries. Keep the
-- identity on the cart line so checkout can mark that entry paid instead of
-- attempting to insert a duplicate dog/class row.
ALTER TABLE public.entry_cart_items
  ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS entry_cart_items_entry_id_idx
  ON public.entry_cart_items(entry_id)
  WHERE entry_id IS NOT NULL;
