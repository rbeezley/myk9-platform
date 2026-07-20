-- Day-of schedule adjustment. Scheduled start_time remains the configured plan;
-- this field records the secretary's revised expectation for live surfaces.
ALTER TABLE public.classes
  ADD COLUMN revised_expected_start timestamptz;

COMMENT ON COLUMN public.classes.revised_expected_start IS
  'Secretary-entered day-of expected start; does not replace scheduled start_time.';
