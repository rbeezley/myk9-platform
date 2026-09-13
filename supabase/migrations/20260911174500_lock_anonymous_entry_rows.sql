-- MYK9-466 — entry lists are not part of the anonymous product surface.
--
-- Anonymous results remain available through the release-gated result view and
-- the TV board RPC. Direct entry rows are not needed by either surface. A
-- table-level revoke is intentional here: it removes the historical
-- column-level allowlist (handler, dog, armband, status, and run-order data)
-- instead of relying on the client not to render those fields.

REVOKE ALL ON public.entries FROM anon;
REVOKE ALL ON public.entries FROM PUBLIC;

COMMENT ON TABLE public.entries IS
  'MYK9-466: anonymous clients must not read direct entry rows. Public results '
  'use view_public_entry_results after release; the TV board uses tv_board_entries.';

NOTIFY pgrst, 'reload schema';
