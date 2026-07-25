-- dog_favorites — server-side record of the dogs a SIGNED-IN user starred at a
-- show, so the notification monitor can watch them for "your turn" proximity
-- push alongside the dogs the user owns (MYK9-79).
--
-- Why a table at all: favorites have always been armband numbers in
-- localStorage (`features/at-show/ringsideDogFavorites.ts`), which is
-- device-local and invisible to the server. Background push on an installed
-- PWA is decided server-side, so the server has to know what was favorited.
-- localStorage stays the device-local store (it must keep working offline and
-- for anonymous passcode sessions); this table is the signed-in mirror.
--
-- Signed-in accounts ONLY. `push_subscriptions.user_id` already FKs
-- `auth.users`, so an anonymous passcode viewer can hold no push subscription;
-- giving `anon` write access here would create rows that can never be notified.
-- `anon` therefore gets NO grant on this table.
--
-- No sequence/identity is created (uuid PK via gen_random_uuid()), so there is
-- no auto-granted sequence USAGE for anon to REVOKE.

CREATE TABLE public.dog_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_id uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  -- Favorites are keyed by armband, not entry/dog id: at ringside the armband
  -- is the only identifier on screen, and it is what the local store has always
  -- held. Armbands are unique per show, which is why show_id is part of the key.
  armband integer NOT NULL CHECK (armband > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dog_favorites_user_show_armband_key UNIQUE (user_id, show_id, armband)
);

COMMENT ON TABLE public.dog_favorites IS
  'Signed-in mirror of at-show dog favorites (armband per show). Feeds the '
  'notification monitor watch set alongside owned dogs. Anonymous passcode '
  'sessions keep the localStorage-only store and receive no push.';

-- The unique constraint has a backing index on (user_id, show_id, armband). The
-- monitor makes exactly one read: `user_id = auth.uid() AND show_id IN (...)`, an exact
-- leading-column prefix of that index, so no additional index is created — a
-- second (user_id, show_id) index would be pure write overhead.

-- =============================================================================
-- Grants — REQUIRED and separate from RLS. Since 2026-10-30 Supabase no longer
-- auto-exposes new public tables to the Data API; without a grant the table
-- silently 404s from supabase-js.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_favorites TO service_role;
-- Deliberately NO grant to anon: favorites-for-push are signed-in only.

-- =============================================================================
-- RLS — every verb scoped to the owning user.
-- =============================================================================

ALTER TABLE public.dog_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY dog_favorites_select_own ON public.dog_favorites
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY dog_favorites_insert_own ON public.dog_favorites
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY dog_favorites_update_own ON public.dog_favorites
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY dog_favorites_delete_own ON public.dog_favorites
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
