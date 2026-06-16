-- Cascade a dog soft-delete to its entries.
--
-- Before this change, soft_delete_dog() only stamped deleted_at on the dog row.
-- Its entries kept deleted_at IS NULL, so a "deleted" dog still appeared in show
-- rosters and scoring through live entries pointing at a tombstoned dog
-- (verified 2026-06-16: deleting dog "Ditto" left all 16 entries live).
--
-- Site admins do the dog deletes and should not have to scratch each entry by
-- hand, so the soft-delete now cascades:
--   * entries  -> soft-deleted (deleted_at / deleted_by stamped) so they vanish
--                 from rosters/scoring just like the dog vanishes from /dogs.
--   * entry_cart_items -> hard-deleted. This table has no soft-delete column
--                 (it is ephemeral pre-checkout cart state) and its dog_id FK is
--                 NO ACTION, so leaving rows would orphan a cart against a
--                 deleted dog. Removing them is the cart-equivalent of a scratch.
--
-- entries.deleted_by FKs auth.users, so it is stamped with auth.uid() (preserved
-- through SECURITY DEFINER) rather than the person id used for the ownership gate.
--
-- The permission gate is unchanged: owner, co-owner, or platform admin. The whole
-- cascade runs inside the single SECURITY DEFINER function, so it is atomic — if
-- the ownership check fails, nothing is touched.
CREATE OR REPLACE FUNCTION public.soft_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_person_id UUID;
  v_rows_affected INT;
BEGIN
  SELECT get_my_person_id() INTO v_person_id;

  UPDATE dogs
  SET
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE
    id = p_dog_id
    AND deleted_at IS NULL
    AND (
      owner_id = v_person_id
      OR co_owner_id = v_person_id
      OR (SELECT is_platform_admin())
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Dog not found or permission denied' USING ERRCODE = '42501';
  END IF;

  -- Cascade: soft-delete the dog's live entries so a deleted dog leaves no live
  -- entries behind in rosters/scoring.
  UPDATE entries
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    dog_id = p_dog_id
    AND deleted_at IS NULL;

  -- Cascade: clear any pre-checkout cart items for the dog (no soft-delete
  -- column; NO ACTION FK would otherwise orphan them).
  DELETE FROM entry_cart_items WHERE dog_id = p_dog_id;
END;
$function$;
