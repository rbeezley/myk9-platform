-- Invariant: a person who still owns live dogs cannot be deleted (it would orphan
-- the dogs and their entries).
--
-- Both delete modes orphan dogs, so both must be blocked:
--   * Soft delete ("Deactivate", deleteUser): sets people.deleted_at; the dog stays
--     live with owner_id pointing at a tombstoned person.
--   * Hard delete (admin-delete-user edge fn): dogs.owner_id is ON DELETE SET NULL,
--     so the dog survives ownerless.
--
-- Enforced as a trigger (not an RPC) because it is an invariant: it must hold for
-- every path — the deleteUser service, the edge function, OrphanedRecordsCleaner,
-- and any future caller — without changing any of them. SECURITY DEFINER so the
-- dog count is accurate regardless of the caller's RLS visibility.
--
-- Scope: primary owner_id only. A co-owned dog keeps its primary owner after the
-- co-owner is deleted, so it is not orphaned. Escape hatch: delete the dogs first
-- (there is no reassign-owner UI).

CREATE OR REPLACE FUNCTION public.prevent_orphaning_dogs_on_person_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dog_count int;
BEGIN
  -- On soft-delete, act only on the deleted_at NULL -> NOT NULL transition.
  -- Restores (NOT NULL -> NULL) and other column updates pass through untouched.
  IF TG_OP = 'UPDATE'
     AND NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_dog_count
  FROM public.dogs
  WHERE owner_id = OLD.id AND deleted_at IS NULL;

  IF v_dog_count > 0 THEN
    -- Custom SQLSTATE (not 23503) so it can't collide with the dog-create
    -- "selected owner no longer exists" mapping, which is the opposite meaning.
    RAISE EXCEPTION
      'This person still owns % live dog(s). Delete those dogs first.',
      v_dog_count
      USING ERRCODE = 'MK001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_person_delete_with_dogs ON public.people;
CREATE TRIGGER prevent_person_delete_with_dogs
  BEFORE DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.prevent_orphaning_dogs_on_person_delete();

DROP TRIGGER IF EXISTS prevent_person_soft_delete_with_dogs ON public.people;
CREATE TRIGGER prevent_person_soft_delete_with_dogs
  BEFORE UPDATE OF deleted_at ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.prevent_orphaning_dogs_on_person_delete();
