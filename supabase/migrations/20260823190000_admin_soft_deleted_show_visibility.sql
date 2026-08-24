-- MYK9-233 — make shows_select and manageable_show_ids() agree about soft-deleted shows.
--
-- INTENDED SEMANTICS (product decision, 2026-08-23):
--   A site admin CAN see soft-deleted shows and their entries. Everyone else cannot
--   reach them THROUGH THE SHOW-MANAGEMENT ROUTE.
--
-- SCOPE, stated precisely because the looser wording was wrong: entries_select is
--   manageable_show_ids() OR handler-is-me OR I-own-the-dog
-- and this migration governs the first arm only. The handler and dog-owner arms carry
-- no show-liveness test, so an exhibitor still reads their OWN entry row for a
-- soft-deleted show. That is unchanged by this migration and is NOT a regression it
-- introduces. It is also not currently exploitable: soft_delete_show() cascades
-- deleted_at to entries and every exhibitor-facing read filters it -- but that leaves a
-- client-side filter as the only guard on a permission boundary. Whether those arms
-- should be gated is a separate product decision, tracked separately; the behaviour is
-- pinned by an explicit assertion in the behavioural test rather than left implied.
--
-- Why: money is the forcing case. A soft-deleted show that took online entries still
-- represents a real platform liability to the club. Before this migration the two rules
-- disagreed, and the disagreement pointed the wrong way:
--
--   shows_select      ANDed (deleted_at IS NULL) OUTSIDE the whole OR group, so the
--                     is_site_admin() arm did not exempt anything -- an admin could not
--                     see a soft-deleted show at all.
--   manageable_show_ids()  is SECURITY DEFINER and never restated the filter, so
--                     shows_select never applied to the rows it reads and entries_select
--                     handed the admin the ENTRIES of a show they could not see.
--
-- Net effect: an admin saw entry money with no show to attribute it to. usePlatformPayoutLedger
-- maps over the shows it resolved, not over the entries it read, so every unresolvable show's
-- collected/refunded/net cents silently left both the table and the summary totals.
--
-- THE FIX IS ONE POLICY, NOT TWO RULES. An earlier draft also rewrote
-- manageable_show_ids() to gate its non-admin arms on deleted_at, on the theory that a
-- SECURITY DEFINER function must restate what its calling policy applies. That was wrong
-- here, and entries_manager_policy_hashable_test.sql caught it: MYK9-126 deliberately
-- made entries of DRAFT and SOFT-DELETED shows stay visible to club-scoped managers even
-- though shows_select hides those show rows, and it pins that with a can_manage_show()
-- parity assertion. The missing filter was a documented decision, not drift.
--
-- So manageable_show_ids() is left exactly as it was. The asymmetry that lost money was
-- never that managers could read those ENTRIES -- it was that nobody could read the SHOW
-- row to attribute them to. Making the show row visible to a site admin is the whole fix.
--
-- After this migration:
--   * site admin  -> deleted and live shows, and their entries
--   * anyone else -> live shows only (unchanged), with MYK9-126's definer-only entry
--     edges for club-scoped managers left intact (unchanged)
--
-- Verified reachable-but-not-firing before the change: 0 soft-deleted shows on staging.

begin;

-- 1. shows_select: lift the site-admin arm OUT of the deleted_at gate.
--    Note this policy has no TO clause -- it applies to PUBLIC, anon included. The
--    deleted_at guard must therefore stay wrapped around every non-admin arm, which is
--    why the filter is repeated inside rather than dropped.
drop policy if exists shows_select on public.shows;
create policy shows_select
  on public.shows for select
  using (
    (select public.is_site_admin())
    or (
      deleted_at is null
      and (
        status = any (array['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])
        or (club_id is not null and (select public.is_club_admin(shows.club_id)))
        or (select public.is_show_secretary(shows.id))
      )
    )
  );

-- manageable_show_ids() is intentionally NOT touched here. See the header: gating it
-- would revert MYK9-126's definer-only edges and break its can_manage_show() parity
-- contract. Its ACL is likewise unchanged, so this migration states no grant decision
-- for it.

commit;
