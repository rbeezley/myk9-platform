-- =============================================================================
-- AKC Scent Work: seed the title prerequisite chain
-- =============================================================================
--
-- 031_seed_sport_titles.sql gave AKC Scent Work its `supersedes_title_ids`
-- relationships but never its `prerequisite_title_id` chain — UKC Nosework and
-- ASCA Scent Detection both got one in the same "RELATIONSHIP UPDATES" section.
-- All 49 AKC titles therefore carry a NULL prerequisite, and `computeTitleProgress`
-- defaults `prerequisiteMet` to true, so every AKC title sorts into the
-- "next eligible" bucket for a dog that has never trialed.
--
-- Visible effect: the dog Overview's "Title progress" card takes the first three
-- unearned titles by sort_order and showed Container Novice / Advanced / Excellent
-- at 0 of 3 to a green dog, and the Career › Title Progress "Locked" group was
-- permanently empty for AKC.
--
-- Two kinds of edge are seeded below, kept separate deliberately:
--
--   (a) REGULATION edges — AKC requires the title at one level in an element
--       before the dog moves up to the next level in that element.
--
--   (b) IMPLIED edges — relationships that are already entailed by (a) but that
--       the engine cannot derive, because `prerequisiteMet` reads one direct
--       parent and never walks the graph. Seeding them moves these titles out of
--       "next eligible" and into "Locked" for a dog that cannot yet pursue them.
--       They add no rule AKC does not already impose.
--
-- Deliberately NOT seeded: Detective (SWD). `docs/design_handoff_heritage/
-- Multi-Registry Scoping.md` §7.5.2 records the rule as "open to dogs holding
-- ANY Master title" — SCM, SIM, SEM, SBM, SHDM or SWM. `prerequisite_title_id`
-- holds one parent and the engine never walks the graph, so no single edge can
-- express that disjunction. Seeding SWM would lock an eligible dog out of
-- Detective on the strength of a rule AKC does not impose, which is worse than
-- leaving SWD open: a wrong lock contradicts the regulations, while an absent
-- one only fails to narrow. Do not "complete" this chain by adding ('SWD','SWM')
-- — teaching the engine an OR is the fix. SWD sorts at 700, so it never reaches
-- the Overview card's first three regardless.
--
-- Every other AKC title except the five Novice element titles and SWN (which is
-- entailed by them) gets exactly one parent.
-- =============================================================================

DO $$
DECLARE
  v_template UUID;
  v_expected CONSTANT INTEGER := 42;
  v_actual INTEGER;
BEGIN
  SELECT id INTO v_template
  FROM public.sport_templates
  WHERE sport_code = 'akc-scent-work';

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'sport_templates row for akc-scent-work not found';
  END IF;

  UPDATE public.sport_titles AS child
  SET prerequisite_title_id = parent.id,
      updated_at = now()
  FROM (
    VALUES
      -- (a) REGULATION: element level progression, Novice → Advanced → Excellent → Master.
      ('SCA', 'SCN'), ('SCE', 'SCA'), ('SCM', 'SCE'),            -- Container
      ('SIA', 'SIN'), ('SIE', 'SIA'), ('SIM', 'SIE'),            -- Interior
      ('SEA', 'SEN'), ('SEE', 'SEA'), ('SEM', 'SEE'),            -- Exterior
      ('SBA', 'SBN'), ('SBE', 'SBA'), ('SBM', 'SBE'),            -- Buried
      ('SHDA', 'SHDN'), ('SHDE', 'SHDA'), ('SHDM', 'SHDE'),      -- Handler Discrimination

      -- (b) IMPLIED: an Elite element title accumulates on top of the base
      -- element title at the same element and level, so it cannot precede it.
      ('SCNE', 'SCN'), ('SCAE', 'SCA'), ('SCEE', 'SCE'), ('SCME', 'SCM'),
      ('SINE', 'SIN'), ('SIAE', 'SIA'), ('SIEE', 'SIE'), ('SIME', 'SIM'),
      ('SENE', 'SEN'), ('SEAE', 'SEA'), ('SEEE', 'SEE'), ('SEME', 'SEM'),
      ('SBNE', 'SBN'), ('SBAE', 'SBA'), ('SBEE', 'SBE'), ('SBME', 'SBM'),
      ('SHDNE', 'SHDN'), ('SHDAE', 'SHDA'), ('SHDEE', 'SHDE'), ('SHDME', 'SHDM'),

      -- (b) IMPLIED: a level title is awarded for the four element titles at that
      -- level, each of which already requires the level below, so the level
      -- titles are strictly sequential.
      ('SWA', 'SWN'), ('SWE', 'SWA'), ('SWM', 'SWE'),

      -- (b) IMPLIED: an Elite level title is awarded for the four Elite element
      -- titles at that level, each of which requires its base element title —
      -- which together are exactly the matching level title.
      ('SWNE', 'SWN'), ('SWAE', 'SWA'), ('SWEE', 'SWE'), ('SWME', 'SWM')
  ) AS chain(child_abbr, parent_abbr)
  JOIN public.sport_titles AS parent
    ON parent.sport_template_id = v_template
   AND parent.abbreviation = chain.parent_abbr
  WHERE child.sport_template_id = v_template
    AND child.abbreviation = chain.child_abbr;

  -- Every pair above must have matched a real row in both directions. A typo in
  -- an abbreviation silently updates nothing, so assert the resulting shape
  -- rather than trusting the statement ran.
  SELECT count(*) INTO v_actual
  FROM public.sport_titles
  WHERE sport_template_id = v_template
    AND prerequisite_title_id IS NOT NULL;

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION
      'akc-scent-work prerequisite seeding wrote % edges, expected %', v_actual, v_expected;
  END IF;

  -- The roots are the five Novice element titles, SWN, and Detective (above).
  SELECT count(*) INTO v_actual
  FROM public.sport_titles
  WHERE sport_template_id = v_template
    AND prerequisite_title_id IS NULL
    AND abbreviation NOT IN ('SCN', 'SIN', 'SEN', 'SBN', 'SHDN', 'SWN', 'SWD');

  IF v_actual <> 0 THEN
    RAISE EXCEPTION 'akc-scent-work left % unexpected title(s) without a prerequisite', v_actual;
  END IF;

  -- No title may be its own prerequisite.
  IF EXISTS (
    SELECT 1 FROM public.sport_titles
    WHERE sport_template_id = v_template AND prerequisite_title_id = id
  ) THEN
    RAISE EXCEPTION 'akc-scent-work seeded a self-referential prerequisite';
  END IF;
END;
$$;
