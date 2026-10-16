-- MYK9-1159 (security audit 2026-10-14, SA-2026-10-14-05): the judge's sign-off
-- columns can only be written by the two sign-off RPCs.
--
-- 20261006154700 (MYK9-1030) records the sign-off through
-- mark_classes_judge_signed_off / clear_class_judge_sign_off, which enforce
-- "completed classes only, keep the first stamp, by = auth.uid(), never in the
-- future". But authenticated holds table-level UPDATE on public.classes and the
-- classes_update policy admits any show manager, so a manager could PATCH
-- judge_signed_off_at / judge_signed_off_by directly with any user id and any
-- time, sidestepping every one of those rules.
--
-- Same guard MYK9-1045 put on results_verified_* (20261008014300 section 6):
-- refuse anon and authenticated writes that CHANGE either column. The SECURITY
-- DEFINER RPCs run as their owner, so current_user is not an API role there and
-- they pass. The WHEN clauses fire only on a real change, so a client write that
-- carries the columns unchanged is untouched (the replica queues sign-off changes
-- as the RPC, never as a row write: ReplicatedClassesTable.setJudgeSignOff).
--
-- Behavioral test: supabase/tests/myk9_1030_judge_sign_off_test.sql (section 10).

BEGIN;

CREATE OR REPLACE FUNCTION private.classes_block_direct_judge_sign_off_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'A judge''s sign-off can only be changed by mark_classes_judge_signed_off and clear_class_judge_sign_off.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.classes_block_direct_judge_sign_off_write() IS
  'MYK9-1159: refuses anon/authenticated writes to classes.judge_signed_off_*; the SECURITY DEFINER sign-off RPCs run as their owner and pass.';

REVOKE ALL ON FUNCTION private.classes_block_direct_judge_sign_off_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_block_direct_judge_sign_off_write ON public.classes;
CREATE TRIGGER trg_00_block_direct_judge_sign_off_write
  BEFORE UPDATE OF judge_signed_off_at, judge_signed_off_by
  ON public.classes
  FOR EACH ROW
  WHEN (OLD.judge_signed_off_at IS DISTINCT FROM NEW.judge_signed_off_at
        OR OLD.judge_signed_off_by IS DISTINCT FROM NEW.judge_signed_off_by)
  EXECUTE FUNCTION private.classes_block_direct_judge_sign_off_write();

DROP TRIGGER IF EXISTS trg_00_block_direct_judge_sign_off_insert ON public.classes;
CREATE TRIGGER trg_00_block_direct_judge_sign_off_insert
  BEFORE INSERT ON public.classes
  FOR EACH ROW
  WHEN (NEW.judge_signed_off_at IS NOT NULL OR NEW.judge_signed_off_by IS NOT NULL)
  EXECUTE FUNCTION private.classes_block_direct_judge_sign_off_write();

COMMIT;
