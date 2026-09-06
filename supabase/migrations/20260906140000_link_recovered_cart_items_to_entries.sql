-- Recovered Finish Payment carts represent existing unpaid entries. Keep the
-- identity on the cart line so checkout can mark that entry paid instead of
-- attempting to insert a duplicate dog/class row.
ALTER TABLE public.entry_cart_items
  ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS entry_cart_items_entry_id_idx
  ON public.entry_cart_items(entry_id)
  WHERE entry_id IS NOT NULL;

-- entry_id is also an identity field. A direct owner PATCH must sever any
-- checkout session just like dog_id/class_id changes do.
CREATE OR REPLACE FUNCTION public.cart_item_identity_change_sever_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  v_cart_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cart_id ELSE NEW.cart_id END;
  UPDATE public.entry_carts
  SET stripe_checkout_session_id = NULL
  WHERE id = v_cart_id
    AND stripe_checkout_session_id IS NOT NULL;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger-only helper: callers must not invoke it directly.
REVOKE EXECUTE ON FUNCTION public.cart_item_identity_change_sever_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cart_item_identity_change_sever_session() FROM authenticated;

DROP TRIGGER IF EXISTS trg_cart_item_identity_sever_session ON public.entry_cart_items;

CREATE TRIGGER trg_cart_item_identity_sever_session
  AFTER UPDATE OF dog_id, class_id, entry_id ON public.entry_cart_items
  FOR EACH ROW
  WHEN (
    OLD.dog_id IS DISTINCT FROM NEW.dog_id
    OR OLD.class_id IS DISTINCT FROM NEW.class_id
    OR OLD.entry_id IS DISTINCT FROM NEW.entry_id
  )
  EXECUTE FUNCTION public.cart_item_identity_change_sever_session();
