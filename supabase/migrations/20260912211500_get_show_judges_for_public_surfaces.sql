-- MYK9-474: the public TV board and the public show-detail roster never render judge names.
--
-- `/tv/:showId` and `/shows/:id` are both public routes with no auth (publicRoutes.tsx), so they
-- run as `anon`. Both reach judge names by EMBEDDING people through judge_assignments:
--
--   tv-display/postgrest.ts   judge_assignments(people(first_name, last_name))   -> "people": null
--   hooks/queries/useShowJudges.ts   people!inner(id, first_name, last_name)      -> [] (INNER drops the row)
--
-- `people` carries column-level anon grants on first_name/last_name, so the embed RESOLVES rather
-- than erroring — but no `people` policy admits anon (every one is TO authenticated), so RLS
-- returns zero rows. Verified cold before this migration:
--
--   GET /rest/v1/classes?select=id,judge_assignments(people(first_name,last_name))
--     -> 200 [{"id":"…","judge_assignments":[{"people": null}]}, …]   every row
--
-- INTENT — judge names for a published show ARE public, and this repo already says so twice:
--   * the generated premium list, a show's public advertisement, names its judges
--     (generate-premium/index.ts builds `judges: [{ name: "First Last" }]` per trial);
--   * get_show_officials publishes the secretary's and chairman's names AND email addresses to
--     cold anon for a published show, withholding only a steward's address (MYK9-402).
-- Naming your judges is how a show attracts entries. The feature was never meant to be dark.
--
-- WHY AN RPC AND NOT AN ANON POLICY ON people
-- A narrow `people` SELECT policy for judges of published shows would make the existing embeds
-- work with no client change, and was the first thing I considered. Rejected:
--
--   1. It inverts the invariant the whole anon column-grant design rests on. anonGrantChecks.ts
--      says those grants are "column-only so anon PostgREST embeds resolve to null instead of
--      42501, with RLS admitting them zero rows", and anonEntriesGrantContract pins it directly:
--      "The column grants above are only safe because RLS admits no anon rows. If either policy
--      is ever recreated admitting anon or PUBLIC, these grants become a live leak — judge email
--      addresses, dog names and photos." Admitting anon rows would make the column allowlist the
--      ONLY thing standing between anon and people.email, which is still granted (MYK9-473).
--   2. This function cannot leak email at all. It is structural, not a column allowlist someone
--      has to maintain: the RETURNS TABLE has no email column, so there is nothing to revoke and
--      nothing to get wrong later.
--   3. It is the pattern this repo already chose for exactly this problem. get_show_officials is
--      a SECURITY DEFINER RPC publishing a controlled slice of people to anon, with its own
--      show-status gate. This mirrors it, gate included.
--
-- Report / audit context: docs/security-audit-2026-09-12.md (MYK9-474 was a follow-up finding).

CREATE OR REPLACE FUNCTION public.get_show_judges(p_show_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  person_id uuid,
  first_name text,
  last_name text,
  trial_id uuid,
  class_id uuid,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ja.id AS assignment_id,
    ja.person_id,
    pe.first_name,
    pe.last_name,
    ja.trial_id,
    ja.class_id,
    ja.status
  FROM public.judge_assignments ja
  JOIN public.shows s ON s.id = ja.show_id
  JOIN public.people pe ON pe.id = ja.person_id
  WHERE ja.show_id = p_show_id
    AND s.deleted_at IS NULL
    -- Same gate as get_show_officials, and the same set MYK9-469 made anon-visible on
    -- judge_assignments itself, so the RPC cannot expose a show the table would have hidden.
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

-- Deliberately granted to anon: that is the whole point of the change. Mirrors the
-- get_show_officials grant shape, and PUBLIC is never granted.
REVOKE ALL ON FUNCTION public.get_show_judges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO service_role;

COMMENT ON FUNCTION public.get_show_judges(uuid) IS
  'MYK9-474: judge names for one show, for the public TV board (/tv/:showId) and the public '
  'show-detail roster (/shows/:id). SECURITY DEFINER with the same show-status gate as '
  'get_show_officials, so an unauthenticated caller reaches only published/upcoming/in_progress/'
  'completed shows — the same set MYK9-469 made anon-visible on judge_assignments. Returns NO '
  'email column, by design: it publishes a controlled slice of people to anon WITHOUT admitting '
  'anon rows on the table, so the invariant anonEntriesGrantContract pins ("the column grants are '
  'only safe because RLS admits no anon rows") is preserved. Do not "simplify" this into an '
  'anon-visible people policy — that would make the column allowlist the only guard on '
  'people.email.';

-- Make PostgREST aware of the new function's SIGNATURE.
--
-- Raised by Codex review of 6b5afc463. Supabase installs a `pgrst_ddl_watch` event trigger on
-- ddl_command_end (verified enabled on the applied database), so this is belt-and-braces rather
-- than strictly required — but it is also the house convention: 139 migrations in this repo issue
-- it, including tv_board_entries, the other RPC the public TV board calls.
--
-- It matters MORE here than for the helper MYK9-470 added the same day. trial_secretary_show_ids
-- is only ever called from inside an RLS policy, server-side, so PostgREST never needs its
-- signature. get_show_judges is invoked as a REST RPC from the browser, so an unreloaded schema
-- cache is the difference between a working public TV board and a 404 — precisely the symptom
-- this migration exists to fix. Note a body-only CREATE OR REPLACE needs no reload (the cached
-- signature is unchanged), which is why 20260905145500's get_show_officials rewrite omits it;
-- a NEW function does.
NOTIFY pgrst, 'reload schema';
