-- MYK9-604: an existing show with persisted trials cannot change sanctioning organization.
-- Changing it would relabel the show's established class identities; create a separate show.

begin;

-- Replace the old projection cascade with an invariant. It used to restamp every child
-- trial's registry_id when organization changed, but did nothing to repair class triples.
DROP TRIGGER IF EXISTS trg_sync_trial_registry_from_show ON public.shows;
DROP FUNCTION IF EXISTS public.sync_trial_registry_from_show();

CREATE OR REPLACE FUNCTION public.prevent_persisted_show_organization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.organization IS NOT DISTINCT FROM OLD.organization THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trials AS trial
    WHERE trial.show_id = OLD.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'A show with trials cannot change sanctioning organization. Create a separate show.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.prevent_persisted_show_organization_change() IS
  'MYK9-604: blocks organization changes once a show has any persisted trial, including soft-deleted trials; create a separate show instead.';

REVOKE ALL ON FUNCTION public.prevent_persisted_show_organization_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_persisted_show_organization_change() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_persisted_show_organization_change() FROM authenticated;

DROP TRIGGER IF EXISTS trg_prevent_persisted_show_organization_change ON public.shows;
CREATE TRIGGER trg_prevent_persisted_show_organization_change
  BEFORE UPDATE OF organization ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_persisted_show_organization_change();

-- Serialize trial writes with organization changes. The FK's KEY SHARE lock is compatible
-- with the NO KEY UPDATE lock from changing a non-key show column. SHARE conflicts with that
-- lock, so either the trial validates against the old organization before the show update
-- (and the show's guard then sees the committed trial), or it waits and validates against the
-- new organization. Without this stronger read lock, an old-registry insert could race past
-- the show's EXISTS check and commit after the organization update.
CREATE OR REPLACE FUNCTION public.enforce_show_registry_on_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization text;
  v_show_registry text;
BEGIN
  SELECT show_row.organization
    INTO v_organization
    FROM public.shows AS show_row
   WHERE show_row.id = NEW.show_id
   FOR SHARE;

  -- Preserve the FK's own 23503 error for a missing parent show.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_show_registry := public.derive_registry_id(v_organization);
  IF NEW.registry_id IS DISTINCT FROM v_show_registry THEN
    RAISE EXCEPTION
      'This show is sanctioned by %. Every trial in it must be a % trial — trials from another organization belong to their own show.',
      v_show_registry, v_show_registry
      USING ERRCODE = 'MK490',
            DETAIL = format(
              'trial %s requested registry_id %L; show %s (organization %L) resolves to %L',
              COALESCE(NEW.id::text, '(new)'), NEW.registry_id, NEW.show_id,
              v_organization, v_show_registry
            ),
            HINT = 'Create a separate show for the other organization''s trials, or change this show''s organization.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_show_registry_on_trial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_registry_on_trial() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_registry_on_trial() FROM authenticated;

COMMENT ON FUNCTION public.enforce_show_registry_on_trial() IS
  'MYK9-490 and MYK9-604: validates each trial against its show''s registry and holds a SHARE lock on that show so trial writes serialize with organization changes.';

commit;
