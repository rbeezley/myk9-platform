-- MYK9-719: retire entry_status 'scratch-requested' / 'scratch_requested'.
--
-- Nothing writes either value any more. The exhibitor-side requestPull went
-- with MYK9-561, the secretary approval queue with MYK9-609 (#2413), and a pull
-- is the exhibitor's own act, written as 'scratched' directly by
-- withdraw_own_entry (MYK9-632, 20260917214300). A read-only count on live on
-- 2026-09-24 found 0 `entries` rows and 0 `entry_status_history` rows holding
-- either spelling.
--
-- The constraint below is copied from its LATEST definition,
-- 20260613090000_fix_entry_status_hyphen_constraint.sql (no later migration
-- redefines it), with the two scratch-request values removed. The move-up
-- request keeps both spellings.
--
-- FUNCTION BODIES ARE DELIBERATELY NOT RE-CREATED HERE. Four functions list the
-- retired values inside an `IN (...)` / status array:
--   get_show_access_codes          (latest: 20260830240000)
--   withdraw_own_entry             (latest: 20260917214300)
--   update_own_entry_jump_height   (latest: 20260916194700)
--   move_up_entry                  (latest: 20260918193300)
-- Once this CHECK holds, no row can carry either value, so those literals can
-- never match: they are dead, not wrong. Re-creating four SECURITY DEFINER
-- functions to delete an unreachable literal would put their whole bodies
-- through review again for no behavior change, and would do it from migration
-- text rather than from the live definitions. Remove them the next time each
-- function is replaced for a real reason.
--
-- `entry_status_history` has no CHECK on its status columns, so any historical
-- row naming the value stays readable; there are none today.

BEGIN;

-- Fail with a sentence, not a bare CHECK violation, if a row appeared since the
-- count above.
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.entries
   WHERE entry_status IN ('scratch-requested', 'scratch_requested');
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'MYK9-719: % entries row(s) still hold a scratch-request status; resolve them (pull or confirm) before retiring the value',
      v_count;
  END IF;
END;
$$;

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

ALTER TABLE public.entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  -- Core lifecycle
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  -- Day-of / ring states
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  -- Terminal / removal states
  'withdrawn', 'scratched', 'absent', 'moved', 'not_accepted',
  -- Waitlist promotion flow
  'pending-payment', 'promotion-expired',
  -- Secretary-approval workflow state (hyphen = what the app writes per mig 142;
  -- underscore retained for any rows written between migrations 173-174)
  'move-up-requested', 'move_up_requested'
));

COMMIT;
