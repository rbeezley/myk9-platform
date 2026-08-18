-- Restore the show-scoped announcement read path for anonymous ringside claims.
--
-- 20260731180000 correctly removed account-wide anonymous reads, but it also
-- applied the real-account-only guard to show_announcements. Passcode
-- participants are anonymous authenticated sessions, so that made the /at-show
-- announcement feed empty. Reuse the existing forge-proof, generation-aware
-- ringside claim instead of reopening table-wide reads.

DROP POLICY IF EXISTS "Authenticated users can read announcements" ON public.show_announcements;
DROP POLICY IF EXISTS show_announcements_select ON public.show_announcements;

CREATE POLICY show_announcements_select ON public.show_announcements
  FOR SELECT
  TO authenticated
  -- Announcements are read-only show-participant communication. A current
  -- claim for any validated passcode role (including exhibitor) may read its
  -- own show's announcements; write policies remain account/author-gated.
  USING (
    (SELECT public.is_real_account())
    OR (
      (SELECT public.ringside_claim_generation_current()) IS TRUE
      AND (SELECT auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
      AND nullif((SELECT auth.jwt() -> 'app_metadata' ->> 'show_id'), '') = show_announcements.show_id::text
    )
  );
