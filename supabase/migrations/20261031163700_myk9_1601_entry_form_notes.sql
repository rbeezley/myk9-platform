-- MYK9-1601: secretary notes on an entry form, private to show officials.
--
-- Privacy is the requirement. enrollments.notes CANNOT hold these: `authenticated`
-- has table-level SELECT on public.enrollments and enrollments_select admits the
-- exhibitor's own row, so a note there is readable through PostgREST. This is its
-- own table whose every policy is gated on the show's OFFICIALS and nobody else.
-- There is deliberately NO arm for the enrollment's handler, a dog's owner, or a
-- club member: a note is visible to exactly the people official_show_ids() admits
-- (site admin; a club-scoped secretary/chairman/steward on their club's shows; a
-- show-scoped steward on that show).
--
-- Identity: created_by is people.id (get_my_person_id()), the same shape
-- secretary_tasks.created_by uses. people.id is NOT auth.uid(); never compare them.
--
-- Soft delete: deleted_at, set by the author or a site admin through UPDATE. The
-- SELECT policy does NOT filter deleted_at (a policy that hid the row would also
-- make the row unlocatable for the soft-delete UPDATE); readers filter
-- `deleted_at IS NULL`. Only officials can read either way. No DELETE grant.
--
-- "Show officials" means official_show_ids(): a site admin, a club-scoped secretary,
-- chairman or steward on their club's shows, and a show-scoped steward on that show. A
-- steward who is also an exhibitor at their own club's show can therefore read notes on
-- their own form. That is accepted: it is inherent to the officials definition.
--
-- Soft delete is final: once deleted_at is set the guard trigger refuses any change to
-- body or deleted_at (no restore, no edit). The author's people row may be deleted: the
-- FK sets created_by to NULL and the guard allows exactly that change.
--
-- Deliberate: an author who is no longer an official of the show (role ended or moved)
-- cannot edit or delete their old notes; only a site admin can.
--
-- show_id is derived from the enrollment by a trigger and cannot be set or changed
-- by the client, so a note can never be filed under a show the caller officiates
-- while pointing at another show's enrollment.

CREATE TABLE public.entry_form_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  show_id       uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  body          text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_by    uuid DEFAULT public.get_my_person_id() REFERENCES public.people(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX entry_form_notes_enrollment_id_idx ON public.entry_form_notes (enrollment_id, created_at DESC);
CREATE INDEX entry_form_notes_show_id_idx ON public.entry_form_notes (show_id);
CREATE INDEX entry_form_notes_created_by_idx ON public.entry_form_notes (created_by);

CREATE OR REPLACE FUNCTION public.entry_form_notes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT e.show_id INTO NEW.show_id
    FROM public.enrollments AS e
    WHERE e.id = NEW.enrollment_id;
    IF NEW.show_id IS NULL THEN
      -- Same code as the RLS refusal for an enrollment the caller may not note, so a
      -- missing form and someone else's form are indistinguishable (no existence oracle).
      RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- created_by may change only from a person to NULL: that is the FK's ON DELETE SET NULL
    -- when the author's people row is deleted, and refusing it would block the person delete.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
       OR NEW.show_id IS DISTINCT FROM OLD.show_id
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL)
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'only the note text can change' USING ERRCODE = '42501';
    END IF;
    -- Deletion is final: a soft-deleted note can be neither edited nor restored.
    IF OLD.deleted_at IS NOT NULL
       AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
      RAISE EXCEPTION 'this note was deleted' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.entry_form_notes_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER entry_form_notes_guard
  BEFORE INSERT OR UPDATE ON public.entry_form_notes
  FOR EACH ROW EXECUTE FUNCTION public.entry_form_notes_guard();

ALTER TABLE public.entry_form_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_form_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY entry_form_notes_select ON public.entry_form_notes
  FOR SELECT TO authenticated
  USING (
    show_id IN (SELECT public.official_show_ids())
    OR (SELECT public.is_site_admin())
  );

CREATE POLICY entry_form_notes_insert ON public.entry_form_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT public.get_my_person_id())
    AND (
      show_id IN (SELECT public.official_show_ids())
      OR (SELECT public.is_site_admin())
    )
  );

-- Edit and soft delete: the note's author (while still an official of the show) or a
-- site admin.
CREATE POLICY entry_form_notes_update ON public.entry_form_notes
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (
      created_by = (SELECT public.get_my_person_id())
      AND show_id IN (SELECT public.official_show_ids())
    )
  )
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (
      created_by = (SELECT public.get_my_person_id())
      AND show_id IN (SELECT public.official_show_ids())
    )
  );

-- Default privileges hand anon AND authenticated full CRUD (+TRUNCATE etc.) on a new
-- table (MYK9-93) and a GRANT never narrows, so revoke first, then grant exactly this.
REVOKE ALL ON public.entry_form_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.entry_form_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_form_notes TO service_role;

COMMENT ON TABLE public.entry_form_notes IS
  'MYK9-1601: private secretary margin notes on an entry form. Show officials and site admins only; never readable by the exhibitor. Do not select from any exhibitor-facing path, email, export or report.';
