-- A show-scoped secretary could see the packet but never confirm printing it.
--
-- The two tables the print reminder depends on had divergent gates:
--
--   trial_packet_snapshots SELECT : can_manage_show(show_id) OR is_show_secretary(show_id)
--   paperwork_prints       ALL    : can_manage_show(show_id)
--
-- `can_manage_show` resolves to `is_trial_secretary`, which requires
-- `ur.show_id IS NULL` — it only recognises CLUB-scoped roles. A secretary
-- assigned to a single show satisfies `is_show_secretary(show_id)` and fails
-- `can_manage_show`, and the route gate is scope-blind, so they reach Reports.
--
-- The result was silent in the worst way. Snapshots loaded, confirmations came
-- back as zero rows (RLS filters rather than errors), so every trial day
-- rendered "not printed" — including days somebody else had confirmed. Pressing
-- "Mark printed" queues a local-first write, so the UI showed "Print
-- confirmation saved" while the server rejected the INSERT with 42501, and the
-- twice-daily reminder chased a day that was already printed, forever.
--
-- `trial_packet_snapshots` already decided that a show-scoped secretary is a
-- legitimate reader of this show's paperwork. This aligns the other table with
-- that decision rather than narrowing the first one, because the secretary
-- running a single show is exactly the person who prints the packet.

DROP POLICY IF EXISTS paperwork_prints_select ON public.paperwork_prints;
CREATE POLICY paperwork_prints_select
ON public.paperwork_prints FOR SELECT
TO authenticated
USING (
  (SELECT can_manage_show(show_id))
  OR (SELECT is_show_secretary(show_id))
);

DROP POLICY IF EXISTS paperwork_prints_insert ON public.paperwork_prints;
CREATE POLICY paperwork_prints_insert
ON public.paperwork_prints FOR INSERT
TO authenticated
WITH CHECK (
  (
    (SELECT can_manage_show(show_id))
    OR (SELECT is_show_secretary(show_id))
  )
  -- Unchanged: you may only record a print you performed, and you may not
  -- write a row that is born voided.
  AND printed_by = (SELECT auth.uid())
  AND voided_at IS NULL
  AND voided_by IS NULL
  AND void_reason IS NULL
);

-- Undo is offered in the UI immediately after confirming, so whoever may
-- confirm must be able to retract.
DROP POLICY IF EXISTS paperwork_prints_void ON public.paperwork_prints;
CREATE POLICY paperwork_prints_void
ON public.paperwork_prints FOR UPDATE
TO authenticated
USING (
  (SELECT can_manage_show(show_id))
  OR (SELECT is_show_secretary(show_id))
)
WITH CHECK (
  (
    (SELECT can_manage_show(show_id))
    OR (SELECT is_show_secretary(show_id))
  )
  AND voided_by = (SELECT auth.uid())
  AND voided_at IS NOT NULL
  AND NULLIF(btrim(void_reason), '') IS NOT NULL
);
