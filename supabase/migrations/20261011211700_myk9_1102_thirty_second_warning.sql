-- =============================================================================
-- sport_class_rules.has_30_second_warning (MYK9-1102)
-- =============================================================================
-- docs/plan-ringside-max-time-requirements.md, part 5. The ringside stopwatch
-- withheld the 30-second warning for any level named "Master" -- a rule hardcoded
-- in packages/scoring-ui/src/hooks/useStopwatch.ts. It is now a rule column, read
-- with the class's max-time rule (cached on the class for offline scoring), so a
-- registry's rulebook decides it.
--
-- Seeded from the AKC Scent Work Regulations (docs/rulebooks/): no 30-second
-- warning at Master (element classes and Handler Discrimination) or in the
-- Detective class ("There will be no 30-second warning in the Detective class").
-- Every other class keeps it. Master was already silent through the hardcoded
-- level check; Detective (level NULL) gains the rule's silence.
--
-- No grant change: sport_class_rules carries table-level grants only (verified
-- 2026-10-11: no column ACLs), so a new column is readable as the table is.

ALTER TABLE public.sport_class_rules
  ADD COLUMN IF NOT EXISTS has_30_second_warning boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.sport_class_rules.has_30_second_warning IS
  'Whether the judge''s timer gives a 30-second warning before max time (AKC Master: no).';

UPDATE public.sport_class_rules r
   SET has_30_second_warning = false
  FROM public.sport_templates t
 WHERE t.id = r.sport_template_id
   AND t.organization = 'AKC'
   AND (r.level = 'Master' OR r.element = 'Detective');
