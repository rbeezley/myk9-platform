-- MYK9-466 — entry rows are not part of the anonymous product surface.
--
-- Public class catalogs use the release-gated results view and count RPC; the
-- base entry table must not be enumerable by anonymous callers.

REVOKE ALL ON public.entries FROM anon;
REVOKE ALL ON public.entries FROM PUBLIC;
-- Authenticated entry workflows already depend on the complete entry projection.
-- Keep that existing boundary explicit while removing anonymous table access.
GRANT SELECT ON public.entries TO authenticated;
GRANT SELECT (id, class_id) ON public.entries TO authenticated;

COMMENT ON TABLE public.entries IS
  'MYK9-466: anonymous clients cannot read base entry rows. Public results use '
  'view_public_entry_results after release; the TV board uses tv_board_entries.';

NOTIFY pgrst, 'reload schema';
