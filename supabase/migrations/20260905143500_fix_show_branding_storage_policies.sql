-- MYK9-398 / SA-2026-09-05-01: the show-branding storage policies authorized
-- against the SHOW'S NAME, not the uploaded object's path.
--
-- 059_club_and_show_branding.sql wrote:
--
--   EXISTS (SELECT 1 FROM shows s
--            WHERE s.id = (storage.foldername(name))[2]::uuid
--              AND (SELECT is_trial_secretary(s.club_id)))
--
-- The author meant storage.objects.name. Inside `SELECT 1 FROM shows s` the
-- unqualified `name` binds to shows.name instead — the inner FROM shadows the
-- outer relation — so the subquery parsed the show's DISPLAY NAME as a path and
-- never referenced the object being written at all. pg_get_expr prints it back
-- as `s.name`, which is how the bug is visible on the applied database.
--
-- The consequence is worse than "wrong show": the subquery is UNCORRELATED, so
-- it evaluates to one global boolean. The only constraint on the object is
-- (storage.foldername(name))[1] = 'shows'. A secretary who renames their own
-- club's show to 'x/<that show's own uuid>' — shows_update permits renaming with
-- no column restriction — makes the EXISTS true and thereby gains INSERT,
-- UPDATE and DELETE over EVERY object under images/shows/** platform-wide, in a
-- public = true bucket. That is cross-tenant asset deletion and brand
-- substitution, self-armed from an ordinary product action.
--
-- The sibling club-branding policies in the same file are correct precisely
-- BECAUSE they have no inner FROM: `name` there does resolve to objects.name.
-- The show-branding trio is the only place a subquery was introduced.
--
-- Fix, applied to all three commands:
--   1. Qualify the column explicitly as objects.name. Never write a bare `name`
--      in a storage policy that contains a subquery — this file is the reason.
--   2. Drop the subquery. Authorize with can_manage_show() on the show id taken
--      FROM THE OBJECT PATH, so the predicate is correlated with the row.
--   3. Guard the cast. A path segment that is not UUID-shaped would raise 22P02
--      from inside the policy; the regex makes it a clean deny instead.
--
-- can_manage_show() covers club admin, trial secretary and platform admin, and
-- already returns false for a club-less show unless the caller is a platform
-- admin (MYK9-258), so that case stays admin-only without a special arm here.
--
-- The regex deliberately checks HEX SHAPE ONLY, not RFC-4122 version/variant
-- nibbles. The stricter pattern used by the trial-packets policy
-- (`[1-5]` version, `[89ab]` variant) would reject this project's seeded and
-- fixture show ids — 'dededede-0000-0000-0000-000000000010' has a '0' version
-- nibble — and lock every one of them out of branding. The only job here is to
-- stop ::uuid raising.

-- One more gap, found in review of this migration and confirmed on the applied
-- database: there is NO SELECT policy covering shows/<id>/... . 20260712130000
-- removed the blanket public SELECT on the images bucket, and the surviving
-- image SELECT policy covers only profiles/<uid> and dogs/<uid>. Postgres
-- requires the source row to pass a SELECT policy for an UPDATE with a WHERE
-- clause, so replacing an existing logo matched zero rows however the UPDATE
-- policy read. Probed as a club-A secretary against their OWN show's object:
-- 0 rows visible, 0 rows updated.
--
-- That also means a cross-tenant UPDATE denial proves nothing on its own —
-- everything is invisible, so zero-rows-affected is the answer whatever the
-- policy says. The behavioural test gained a positive control for exactly this.

BEGIN;

DROP POLICY IF EXISTS "Secretaries can upload show branding" ON storage.objects;
DROP POLICY IF EXISTS "Secretaries can update show branding" ON storage.objects;
DROP POLICY IF EXISTS "Secretaries can delete show branding" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can read show branding" ON storage.objects;

-- Same predicate as the write policies, so read and write cannot drift apart.
-- Object bytes in this bucket are already world-readable over the public
-- Storage endpoint (images is public = true); this grants no new disclosure,
-- it makes the row addressable in SQL so the write policies can operate.
CREATE POLICY "Show managers can read show branding"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(objects.name))[1] = 'shows'
  AND (storage.foldername(objects.name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    (SELECT can_manage_show((storage.foldername(objects.name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can upload show branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(objects.name))[1] = 'shows'
  AND (storage.foldername(objects.name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    (SELECT can_manage_show((storage.foldername(objects.name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can update show branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(objects.name))[1] = 'shows'
  AND (storage.foldername(objects.name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    (SELECT can_manage_show((storage.foldername(objects.name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
)
-- WITH CHECK as well as USING: 059 had none, so an authorized caller could
-- RENAME a row out of their own show's prefix into another show's. That is the
-- same cross-tenant write by a different verb.
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(objects.name))[1] = 'shows'
  AND (storage.foldername(objects.name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    (SELECT can_manage_show((storage.foldername(objects.name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can delete show branding"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(objects.name))[1] = 'shows'
  AND (storage.foldername(objects.name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    (SELECT can_manage_show((storage.foldername(objects.name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

COMMIT;
