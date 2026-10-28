-- MYK9-1327 Batch 3: a class has at most one confirmed judge, enforced by the database.
--
-- CONTEXT.md, Class: "a Class has exactly one Judge". Until now only the client's
-- delete-then-insert kept that true, and two devices racing a pick could leave two confirmed
-- class-level rows. Batch 1 (20261028131700_myk9_1327_set_class_judge.sql) added
-- public.set_class_judge(), which replaces the class's judge in one transaction under an advisory
-- lock; Batch 3 switches every client class-judge write to it. With no direct writer left, the
-- invariant can be a constraint instead of a convention.
--
-- WHY IT SHIPS WITH THE CLIENT SWITCH, NOT BEFORE. Enforced while an old client still inserts a
-- class-level row directly, this index would refuse a second device's insert (23505), park that
-- device's pick, and strand it. It therefore goes out in the same release as the client change
-- (docs/plan-myk9-1327-atomic-judge-pick.md, Decision 2).
--
-- SHAPE. Partial: only CONFIRMED CLASS-LEVEL rows. Show-level rows (class_id IS NULL) are many per
-- show by design, and invited / declined / cancelled class-level rows may sit beside the confirmed
-- one (set_class_judge deletes them all on a pick, but a direct invitation flow may still hold
-- them), so neither is constrained.
--
-- DATA. Checked on the live database on 2026-10-28: 0 classes have more than one confirmed
-- class-level judge_assignments row, so the index builds without a cleanup step.
--
-- Plain CREATE UNIQUE INDEX, not CONCURRENTLY: migrations run in a transaction, and the table is
-- small enough that the brief lock is immaterial.

CREATE UNIQUE INDEX IF NOT EXISTS judge_assignments_one_confirmed_judge_per_class
  ON public.judge_assignments (class_id)
  WHERE class_id IS NOT NULL AND status = 'confirmed';

COMMENT ON INDEX public.judge_assignments_one_confirmed_judge_per_class IS
  'MYK9-1327: a Class has exactly one confirmed Judge (CONTEXT.md, Class). Partial: show-level rows (class_id IS NULL) and non-confirmed rows are unconstrained.';
