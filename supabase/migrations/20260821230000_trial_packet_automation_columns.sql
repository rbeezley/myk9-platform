-- MYK9-228 phase 3: let a packet exist without a person having asked for it.
--
-- `trial_packet_snapshots` was written for the manual path only, and two of its
-- assumptions block automation:
--
--   1. `generated_by` is NOT NULL. There is no auth user behind a cron run, and
--      inventing a sentinel UUID would put a fake author on an audit row.
--   2. Nothing records WHICH DAY a packet covers. The automated trigger's
--      idempotency key is (show, trial date), and the storage path carries only
--      a snapshot UUID — so "has tonight's packet already gone out?" is not a
--      question this table can currently answer.

ALTER TABLE public.trial_packet_snapshots
  ALTER COLUMN generated_by DROP NOT NULL;

ALTER TABLE public.trial_packet_snapshots
  ADD COLUMN IF NOT EXISTS trial_date DATE,
  ADD COLUMN IF NOT EXISTS generated_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.trial_packet_snapshots
  DROP CONSTRAINT IF EXISTS trial_packet_generated_source_check;
ALTER TABLE public.trial_packet_snapshots
  ADD CONSTRAINT trial_packet_generated_source_check
  CHECK (generated_source IN ('manual', 'automated'));

-- Dropping NOT NULL must not silently make the author optional on the path
-- that HAS one: a manual packet with no `generated_by` would be a row claiming
-- a person asked for it while recording no person.
ALTER TABLE public.trial_packet_snapshots
  DROP CONSTRAINT IF EXISTS trial_packet_manual_has_author;
ALTER TABLE public.trial_packet_snapshots
  ADD CONSTRAINT trial_packet_manual_has_author
  CHECK (generated_source <> 'manual' OR generated_by IS NOT NULL);

COMMENT ON COLUMN public.trial_packet_snapshots.generated_by IS
  'Auth user who requested the packet. NULL only when generated_source is automated.';
COMMENT ON COLUMN public.trial_packet_snapshots.trial_date IS
  'The trial day this packet covers. NULL for whole-show packets generated before the per-day split.';
COMMENT ON COLUMN public.trial_packet_snapshots.generated_source IS
  'How the packet came to exist: a show manager pressed the button, or a scheduled trigger fired.';

-- The automated trigger asks "is there already a delivered packet for this show
-- and day?" on every run. Without this it is a scan of every attempt ever made
-- for the show, including the failed ones.
CREATE INDEX IF NOT EXISTS trial_packet_snapshots_show_day_idx
  ON public.trial_packet_snapshots (show_id, trial_date, delivery_status);
