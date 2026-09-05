-- Two P3 hardening gaps from the 2026-09-05 security audit (MYK9-404).
--
-- ---------------------------------------------------------------------------
-- SA-2026-09-05-06 — ringside_containment and ringside_containment_audit are
-- the only 2 of 131 public tables with RLS neither enabled nor forced.
--
-- They are not reachable: 20260731190000 revokes anon and authenticated and
-- grants only service_role, deliberately ("No client grants by design"). This
-- is belt for those braces. The repo-wide invariant is ENABLE + FORCE on every
-- public table, and RLS is the layer that survives an accidental future grant —
-- including the ALTER DEFAULT PRIVILEGES that hands anon full CRUD on anything
-- new in this schema. No policies are added: service_role bypasses RLS, and
-- everyone else should see nothing, which is exactly what a policy-less forced
-- table returns.
--
-- Worth recording why this went unnoticed: the 2026-07-31 audit carried
-- "RLS enabled AND forced on all 119 public tables" as a standing baseline. The
-- count was 131 by 2026-09-05 and two were exempt. A baseline asserted rather
-- than re-measured is how that stayed true-looking for five weeks.
--
-- ---------------------------------------------------------------------------
-- SA-2026-09-05-07 — view_public_entry_results ignores class and trial
-- soft-delete.
--
-- The anon-facing results view guards the entry and the show but not the two
-- levels between them:
--
--   WHERE e.deleted_at IS NULL AND sh.deleted_at IS NULL AND sh.status = ANY (...)
--
-- so entries of a soft-deleted class or trial stay publicly readable with their
-- released results. Same shape as SA-2026-07-29-08 / MYK9-149 (closed for
-- entries), one level up the hierarchy. Measured on the applied database at the
-- time of writing: 2 soft-deleted classes and 1 soft-deleted trial exist, and 0
-- entries currently reach anon through them — the mechanism is real, today's
-- exposure is zero. Fixing it now is cheaper than fixing it after a secretary
-- soft-deletes a class that has entries in it.
--
-- The view is security_invoker = false and owned by a BYPASSRLS role, so its
-- WHERE clause is the only guard — no policy is going to catch this.
--
-- security_invoker is carried INLINE on the CREATE OR REPLACE. A bare
-- CREATE OR REPLACE VIEW WIPES reloptions, and security_invoker then falls back
-- to its default of false. That happens to be the value this view wants, so it
-- would look harmless — but relying on the default is how 20260817170000's
-- sibling handed every authenticated user judge_notes and payment_status.
-- State it, do not inherit it.
--
-- The column list, order and types are unchanged, so CREATE OR REPLACE is legal
-- here and the ACL survives (only DROP resets it). trials joins LEFT, not INNER,
-- so a class with a NULL trial_id keeps behaving exactly as it does today.

BEGIN;

-- --- SA-2026-09-05-06 -------------------------------------------------------

ALTER TABLE public.ringside_containment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ringside_containment FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ringside_containment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ringside_containment_audit FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ringside_containment_audit IS
  'Append-only trip/rearm history for the ringside OCC breaker (MYK9-115). RLS '
  'is enabled and forced with no policies: only service_role and the SECURITY '
  'DEFINER breaker functions reach it, and no client role holds a grant '
  '(MYK9-404).';

-- --- SA-2026-09-05-07 -------------------------------------------------------

CREATE OR REPLACE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
 SELECT e.id,
    e.class_id,
    c.trial_id,
    e.show_id,
    e.dog_id,
    e.armband,
    e.handler,
    e.run_order,
    e.is_in_ring,
    e.is_scored,
    e.check_in_status,
    e.entry_status,
    e.scoring_completed_at,
    e.created_at,
        CASE
            WHEN vis.placement_visible THEN e.final_placement
            ELSE NULL::integer
        END AS final_placement,
        CASE
            WHEN vis.qualification_visible THEN e.result_status
            ELSE NULL::text
        END AS result_status,
        CASE
            WHEN vis.time_visible THEN e.search_time_seconds
            ELSE NULL::numeric
        END AS search_time_seconds,
        CASE
            WHEN vis.time_visible THEN e.total_score
            ELSE NULL::numeric
        END AS total_score,
        CASE
            WHEN vis.faults_visible THEN e.total_faults
            ELSE NULL::integer
        END AS total_faults,
        CASE
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'qualified'::text THEN 'Q'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'nq'::text THEN 'NQ'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'absent'::text THEN 'ABS'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'excused'::text THEN 'EX'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'withdrawn'::text THEN 'WD'::text
            ELSE 'pending'::text
        END AS result_text,
    d.name AS dog_name,
    d.call_name AS dog_call_name,
    d.breed AS dog_breed,
    d.image_url AS dog_image_url,
    c.name AS class_name,
    c.level AS class_level,
    c.element AS class_element,
    c.results_released_at AS class_results_released_at
   FROM entries e
     JOIN classes c ON c.id = e.class_id
     JOIN shows sh ON sh.id = e.show_id
     LEFT JOIN trials t ON t.id = c.trial_id
     LEFT JOIN dogs d ON d.id = e.dog_id
     CROSS JOIN LATERAL resolve_class_result_visibility(e.class_id) vis(placement_visible, qualification_visible, time_visible, faults_visible)
  WHERE e.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND (t.id IS NULL OR t.deleted_at IS NULL)
    AND sh.deleted_at IS NULL
    AND (sh.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text]));

COMMENT ON VIEW public.view_public_entry_results IS
  'Anon-readable released results. Owner-run (security_invoker = false), so this '
  'view body is the ONLY guard — it must exclude soft-deleted entries, classes, '
  'trials and shows itself (MYK9-149, MYK9-404).';

COMMIT;
