-- The emergency packet upload policy rejected every show this project issues.
--
-- `20260820220000_emergency_trial_packets.sql` gated the folder name on an
-- RFC-4122 uuid: version nibble [1-5], variant [89ab]. `seed-demo.sql` mints
-- `dededede-…` and `dec1a55e-…` ids, so the only show on staging —
-- dededede-0000-0000-0000-000000000010 — has version 0 and variant 0 and fails
-- the check. Every manual "Prepare and email packet" upload was denied by RLS,
-- which is why `trial_packet_snapshots` has never held a single row.
--
-- The same over-strict pattern was in the edge functions' payload validation
-- and is fixed alongside this. Shape-only is the right bar: Postgres accepts
-- any hex-shaped uuid, and the folder is cast to uuid and compared against a
-- real show anyway, so the regex is a guard against a malformed cast, not an
-- authorization control. `can_manage_show` is the authorization control.

DROP POLICY IF EXISTS "Show managers can upload emergency trial packets"
  ON storage.objects;
CREATE POLICY "Show managers can upload emergency trial packets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trial-packets'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (
      (SELECT can_manage_show(((storage.foldername(name))[1])::uuid))
      OR (SELECT is_show_secretary(((storage.foldername(name))[1])::uuid))
    )
    ELSE false
  END
);
