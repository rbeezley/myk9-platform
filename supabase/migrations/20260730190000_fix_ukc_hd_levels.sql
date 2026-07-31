-- =============================================================================
-- Fix UKC Handler Discrimination level labels
-- =============================================================================
-- UKC's per-element level sets are NOT uniform. The four grid elements (Container,
-- Interior, Exterior, Vehicle) run Novice → Advanced → Superior → Master → Elite.
-- Handler Discrimination does NOT: it has exactly four classes, and uses "Excellent"
-- at rank 3 instead of "Superior", with no Elite at all.
--
-- Two independent sources agree:
--
--   docs/design_handoff_heritage/Multi-Registry Scoping.md §8 (source of record):
--     | Handler Discrimination (HD) | Novice, Advanced, Excellent, Master
--     |                             | (4 — no Superior label, no Elite)      |
--     "the level list must be modeled per element, not once per sport: HD swaps
--      'Excellent' for 'Superior' at rank 3 and has no Elite."
--
--   docs/rulebooks/ukc-nose-work-rules.txt, Chapter 11 §2:
--     "There are four Handler Discrimination classes and each class must be earned
--      successively. The four classes are: Novice (NHD), Advanced (AHD),
--      Excellent (EHD), Master (MHD)."
--   The rulebook contains no "Handler Discrimination Superior" or "… Elite" anywhere.
--
-- `features/registries/ukc.ts` models this correctly (HD_LEVELS omits superior/elite).
-- Migration 030 seeded HD from the main-element level list instead, so the wizard has
-- been offering two UKC HD classes that do not exist and withholding one that does.
-- Found by the registry↔DB parity test added in the same PR as this migration.
--
-- Fix, in two parts:
--   1. Rank 3 is already correct positionally (display_order 45/46) — only its LABEL is
--      wrong. Relabel rather than delete-and-reinsert, so the seeded scoring parameters
--      (time band, hide counts, timer mode, odor, MRV) are preserved exactly.
--   2. Elite has no rank in HD's progression at all, so those rows are removed.
--
-- Verified before writing: HD Excellent does not already exist, so the relabel cannot
-- collide with UNIQUE(sport_template_id, element, level, section). Only template rows
-- are touched — no `classes` or `entries` rows reference these directly.
-- =============================================================================

DO $$
DECLARE
  v_template_id UUID;
  v_relabelled INTEGER;
  v_deleted INTEGER;
BEGIN
  SELECT id INTO v_template_id
  FROM public.sport_templates
  WHERE sport_code = 'ukc-nosework';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'ukc-nosework sport template not found';
  END IF;

  -- Guard: relabelling would violate the unique constraint if Excellent already exists.
  IF EXISTS (
    SELECT 1 FROM public.sport_class_rules
    WHERE sport_template_id = v_template_id
      AND element = 'Handler Discrimination'
      AND level = 'Excellent'
  ) THEN
    RAISE EXCEPTION 'UKC Handler Discrimination Excellent already exists — migration already applied?';
  END IF;

  -- 1. Superior → Excellent (rank 3), keeping every scoring parameter.
  UPDATE public.sport_class_rules
  SET level = 'Excellent',
      class_name = replace(class_name, 'Superior', 'Excellent'),
      updated_at = NOW()
  WHERE sport_template_id = v_template_id
    AND element = 'Handler Discrimination'
    AND level = 'Superior';

  GET DIAGNOSTICS v_relabelled = ROW_COUNT;

  -- 2. HD has no Elite.
  DELETE FROM public.sport_class_rules
  WHERE sport_template_id = v_template_id
    AND element = 'Handler Discrimination'
    AND level = 'Elite';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- UKC runs A/B on every level, so both counts must be exactly 2.
  IF v_relabelled <> 2 THEN
    RAISE EXCEPTION 'Expected to relabel 2 HD Superior rows, relabelled %', v_relabelled;
  END IF;
  IF v_deleted <> 2 THEN
    RAISE EXCEPTION 'Expected to delete 2 HD Elite rows, deleted %', v_deleted;
  END IF;

  RAISE NOTICE 'UKC HD levels fixed: % relabelled Superior→Excellent, % Elite removed',
    v_relabelled, v_deleted;
END $$;
