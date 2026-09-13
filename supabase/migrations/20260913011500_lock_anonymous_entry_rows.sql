-- MYK9-466 — entry rows are not part of the anonymous product surface.
--
-- The public class catalog embeds entries(id) only to preserve the existing
-- class-query shape. Keep those non-sensitive columns available while
-- removing every handler, dog, armband, status, and result field from anon.

REVOKE ALL ON public.entries FROM anon;
REVOKE ALL ON public.entries FROM PUBLIC;
REVOKE ALL ON public.entries FROM authenticated;
GRANT SELECT (id, class_id) ON public.entries TO anon;

COMMENT ON TABLE public.entries IS
  'MYK9-466: anonymous clients may only read entry ids for safe class embeds. '
  'Public results use view_public_entry_results after release; the TV board '
  'uses tv_board_entries.';

NOTIFY pgrst, 'reload schema';
