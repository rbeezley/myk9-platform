-- Per-class behavior when online entry creation exceeds the judge-day/class
-- capacity gate. Default preserves migration-114 behavior: join waitlist.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS overflow_policy text NOT NULL DEFAULT 'waitlist'
  CHECK (overflow_policy IN ('waitlist', 'deny'));

COMMENT ON COLUMN public.classes.overflow_policy IS
  'When online entry capacity is exhausted: waitlist creates a waitlist row; deny blocks entry creation.';
