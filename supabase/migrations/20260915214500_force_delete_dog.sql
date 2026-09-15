-- force_delete_dog — a platform-admin override for the MK002 refusal.
--
-- soft_delete_dog refuses when a dog has live entries that are paid or scored
-- (20260830190000). That guard is correct for every normal caller: deleting a
-- paid entry strands a captured Stripe charge with no refund decision, and
-- deleting a scored entry silently re-ranks the rest of its class, since
-- placements are server-authoritative and recomputed at 100% scored.
--
-- But a site admin cleaning up test or junk data has no way through it, and the
-- only escape today is to scratch/refund entries one at a time. This function is
-- that escape hatch, deliberately shaped so it can never become the normal path:
--
--   * It is a SEPARATE function, not a `p_force` parameter on soft_delete_dog.
--     Adding a second parameter with a DEFAULT would leave the 1-arg version in
--     place and make every existing `soft_delete_dog(p_dog_id => …)` call
--     ambiguous (42725). A separate name also keeps the admin gate total: there
--     is no argument value that turns this into an ordinary delete.
--   * The is_platform_admin() check is the FIRST statement, so a non-admin
--     learns nothing about the dog — not even whether it exists.
--   * It does NOT refund, void, or otherwise touch money. A force-deleted paid
--     entry leaves its charge captured. The UI says so in those words; this
--     function is not the place to guess at a refund policy.
--
-- Reversibility: restore_dog re-links entries by matching `entries.deleted_at`
-- to the dog's `deleted_at`. Both UPDATEs below read NOW(), which is
-- transaction-start time and therefore identical across them, so a force delete
-- restores from Admin → Deleted Items exactly like an ordinary one.

CREATE OR REPLACE FUNCTION public.force_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  v_rows_affected INT;
BEGIN
  -- Admin-only, checked before anything is read or written. Ownership is NOT an
  -- alternative here: an owner may delete their own dog via soft_delete_dog,
  -- which keeps the MK002 guard. Overriding that guard is an admin act.
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dogs
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    id = p_dog_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Dog not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- No MK002 check. That is the entire point of this function.

  -- Cascade, identical to soft_delete_dog's: live entries, pre-checkout cart
  -- items (no soft-delete column, and a NO ACTION FK would orphan them), and
  -- waitlist spots (so a deleted dog cannot be promoted into a live entry).
  -- Armbands are deliberately untouched — see 20260830190000's header before
  -- re-adding a release here.
  UPDATE public.entries
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    dog_id = p_dog_id
    AND deleted_at IS NULL;

  DELETE FROM public.entry_cart_items WHERE dog_id = p_dog_id;

  DELETE FROM public.waitlist_entries WHERE dog_id = p_dog_id;
END;
$function$;

-- A SECURITY DEFINER function is EXECUTE-able by PUBLIC by default, which would
-- expose it to anon. The internal is_platform_admin() gate would still refuse,
-- but do not rely on a single guard for a function that bypasses a money check.
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.force_delete_dog(uuid) TO authenticated;

COMMENT ON FUNCTION public.force_delete_dog(uuid) IS
  'Platform-admin override for soft_delete_dog''s MK002 refusal: soft-deletes a dog and cascades to its entries, cart items and waitlist spots even when entries are paid or scored. Issues no refund. Reversible via restore_dog.';
