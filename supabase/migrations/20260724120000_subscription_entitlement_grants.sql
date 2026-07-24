-- Auditable entitlement grants + server-side Premium authorization.
--
-- Implements design.md Decisions 7, 7A and 6 (server context) for the
-- exhibitor-journey-completion change (Slice 3A, MYK9-71).
--
-- What this migration adds (all additive; the legacy `people.early_adopter_until`
-- column, its protection triggers, and every existing reader are left untouched
-- for the compatibility release — cleanup is a separate, later migration):
--
--   1. `subscription_entitlement_grants` durable history table (admin-read RLS,
--      no non-admin policies -> deny-by-default for all verbs to everyone else).
--   2. `has_effective_premium_access(person_id, evaluated_at)` — the single
--      server authority for account-Premium (paid tier OR active grant; the
--      Analytics trial NEVER makes this true).
--   3. `get_own_entitlement_context()` — sanitized own-account projection for the
--      unified client resolver (Decision 6). Never exposes reason/actor ids.
--   4. `admin_grant_entitlement()` / `admin_revoke_entitlement()` — the only
--      write paths, each site-admin gated, reason-required, range-validated,
--      target-person locked. Neither touches Stripe rows nor early_adopter_until.
--   5. Backfill of every non-null `early_adopter_until` as a `founding` grant.
--   6. Premium INSERT/UPDATE enforcement (Decision 7A) on the exhibitor-owned
--      record tables. SELECT/DELETE semantics are preserved so downgraded owners
--      keep read + delete.
--
-- No sequence/identity is created (uuid PK via gen_random_uuid()), so there is
-- no auto-granted sequence USAGE for anon to REVOKE.

-- =============================================================================
-- 1. subscription_entitlement_grants
-- =============================================================================

CREATE TABLE public.subscription_entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  grant_type text NOT NULL CHECK (grant_type IN ('founding', 'complimentary')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  -- Nullable: backfilled founding grants have no human actor. Admin-authored
  -- grants always set this from the acting admin's person id.
  granted_by_person_id uuid REFERENCES public.people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Explicit revoke (Decision 7): only set by admin_revoke_entitlement.
  revoked_at timestamptz,
  revoked_by_person_id uuid REFERENCES public.people(id),
  revoke_reason text,
  -- Explicit replace (Decision 7): set on the prior grant when an admin replaces
  -- an overlapping active grant. Distinct from revocation so history stays truthful.
  superseded_at timestamptz,
  superseded_by_grant_id uuid REFERENCES public.subscription_entitlement_grants(id),
  CONSTRAINT subscription_entitlement_grants_range_valid CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.subscription_entitlement_grants IS
  'Durable, auditable founding/complimentary Premium grants. Admin-read only; '
  'writes exclusively through admin_grant_entitlement/admin_revoke_entitlement. '
  'Replaces the ad-hoc people.early_adopter_until field (Decision 7).';

-- Admin grant-history lookups (User Management panel) scan by person.
CREATE INDEX idx_seg_person_id
  ON public.subscription_entitlement_grants (person_id, created_at DESC);

-- Active-range evaluation (has_effective_premium_access, overlap checks) only
-- ever looks at non-revoked, non-superseded rows -> partial index.
CREATE INDEX idx_seg_active_range
  ON public.subscription_entitlement_grants (person_id, starts_at, ends_at)
  WHERE revoked_at IS NULL AND superseded_at IS NULL;

-- Explicit Data API grants: Supabase no longer auto-exposes new public tables.
-- authenticated gets the verbs; RLS below is the real gate (admin-read only,
-- writes denied for everyone -> forced through the SECURITY DEFINER RPCs).
-- No anon grant: entitlement state is never anonymous-readable.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_entitlement_grants TO authenticated;

ALTER TABLE public.subscription_entitlement_grants ENABLE ROW LEVEL SECURITY;

-- Only site admins may read raw rows (reason/actor/revocation are internal).
-- Non-admins get the sanitized projection via get_own_entitlement_context().
-- Wrapped in (SELECT ...) to evaluate is_site_admin() once per statement and to
-- avoid the historical recursion issues noted in the inventory.
CREATE POLICY "seg_admin_select"
  ON public.subscription_entitlement_grants
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_site_admin()));

-- NO insert/update/delete policies and NO non-admin select policy are defined.
-- RLS therefore denies every write to every role (including site admins) at the
-- table boundary; the only writers are the SECURITY DEFINER RPCs below. This is
-- deliberate deny-by-default (spec: "Direct authenticated select/insert/update/
-- delete on the table is denied to non-admins").

-- =============================================================================
-- 2. has_effective_premium_access — the server authority for account Premium
-- =============================================================================

-- True iff the person has active PAID Premium (exhibitor_profiles tier) OR an
-- active grant at p_evaluated_at. The Analytics scored-show trial deliberately
-- does NOT participate here: it authorizes only trialed Analytics content, never
-- dog-record or manual-result mutation (Decision 7A).
--
-- Paid tier requires a NON-NULL expiry in the future: Stripe always stamps an
-- expiry on an active subscription, and the client gate treats premium-with-null-
-- expiry as expired, so a null subscription_expires_at is NOT active here.
--
-- Caller scoping: this is EXECUTE-revoked from PUBLIC/anon and additionally only
-- answers truthfully for the caller's own person (p_person_id =
-- get_my_person_id()) or a site admin. Any other caller gets false — never an
-- error, so RLS policies (which always pass the caller's own id) keep working
-- while arbitrary-UUID probing by non-admins is denied.
CREATE OR REPLACE FUNCTION public.has_effective_premium_access(
  p_person_id uuid,
  p_evaluated_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    (p_person_id = public.get_my_person_id() OR public.is_site_admin())
    AND (
      EXISTS (
        SELECT 1
        FROM public.exhibitor_profiles ep
        WHERE ep.person_id = p_person_id
          AND ep.subscription_tier IN ('premium', 'pro')
          AND ep.subscription_expires_at IS NOT NULL
          AND ep.subscription_expires_at > p_evaluated_at
      )
      OR EXISTS (
        SELECT 1
        FROM public.subscription_entitlement_grants g
        WHERE g.person_id = p_person_id
          AND g.revoked_at IS NULL
          AND g.superseded_at IS NULL
          AND g.starts_at <= p_evaluated_at
          AND g.ends_at > p_evaluated_at
      )
    );
$$;

COMMENT ON FUNCTION public.has_effective_premium_access(uuid, timestamptz) IS
  'Server authority for account-Premium (paid tier with non-null future expiry OR '
  'active grant). Caller-scoped: own person or site admin only, else false. Used '
  'by Premium record RLS and by get_own_entitlement_context so UI and write '
  'authorization cannot diverge. Analytics trial is intentionally excluded.';

-- PG grants EXECUTE to PUBLIC by default; strip it so only the scoped, explicitly
-- granted roles can call this (defense in depth alongside the caller scoping).
REVOKE ALL ON FUNCTION public.has_effective_premium_access(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_effective_premium_access(uuid, timestamptz) TO authenticated;

-- =============================================================================
-- 3. get_own_entitlement_context — sanitized own-account projection
-- =============================================================================

-- Returns, for the caller's person: server evaluation time, paid tier/expiry
-- from exhibitor_profiles, a sanitized projection of the active-or-most-recent
-- grant (type + derived status + start + end ONLY — never reason/actor ids), and
-- the distinct scored-show count the existing Analytics trial rule needs.
--
-- scored_show_count equivalence: AnalyticsPage computes
--   new Set(allEntries.filter(e => e.resultText !== 'pending').map(e => e.showId)).size
-- where allEntries come from view_authenticated_entry_results for the caller's
-- dogs. In that view result_text is non-null (non-'pending') for a row ONLY when
-- (can_view_scores OR vis.qualification_visible) AND is_scored = true AND
-- result_status is one of the recognized codes (qualified/nq/absent/excused/
-- withdrawn) — see 20260621190000_ringside_entry_read_for_staff.sql result_text
-- CASE. The caller here is the dog's owner/co-owner (is_own_entry), for whom
-- can_view_scores is false (that flag is manager-or-assigned-judge only), so the
-- OR collapses to vis.qualification_visible from resolve_class_result_visibility.
-- The server query below reproduces exactly that predicate: distinct show_id over
-- the caller's owned/co-owned dogs where the entry is scored, carries a recognized
-- result_status, and the class's qualification results are visible.
CREATE OR REPLACE FUNCTION public.get_own_entitlement_context()
RETURNS TABLE (
  evaluated_at timestamptz,
  paid_tier text,
  paid_expires_at timestamptz,
  grant_type text,
  grant_status text,
  grant_starts_at timestamptz,
  grant_ends_at timestamptz,
  scored_show_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_now timestamptz := now();
  v_grant public.subscription_entitlement_grants%ROWTYPE;
  v_status text;
  v_scored integer := 0;
  v_paid_tier text;
  v_paid_expires timestamptz;
BEGIN
  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid();

  IF v_person_id IS NULL THEN
    -- No linked person: return a single row of nulls with server time so the
    -- resolver still has evaluatedAt and can render free.
    RETURN QUERY SELECT v_now, NULL::text, NULL::timestamptz, NULL::text,
                        NULL::text, NULL::timestamptz, NULL::timestamptz, 0;
    RETURN;
  END IF;

  SELECT ep.subscription_tier, ep.subscription_expires_at
    INTO v_paid_tier, v_paid_expires
  FROM public.exhibitor_profiles ep
  WHERE ep.person_id = v_person_id;

  -- Prefer the currently-active grant; otherwise the most recently created row.
  SELECT g.* INTO v_grant
  FROM public.subscription_entitlement_grants g
  WHERE g.person_id = v_person_id
  ORDER BY
    (g.revoked_at IS NULL
       AND g.superseded_at IS NULL
       AND g.starts_at <= v_now
       AND g.ends_at > v_now) DESC,
    g.created_at DESC
  LIMIT 1;

  IF v_grant.id IS NOT NULL THEN
    IF v_grant.revoked_at IS NOT NULL THEN
      v_status := 'revoked';
    ELSIF v_grant.superseded_at IS NOT NULL THEN
      v_status := 'superseded';
    ELSIF v_grant.ends_at <= v_now THEN
      v_status := 'expired';
    ELSIF v_grant.starts_at > v_now THEN
      -- Future-dated grant (legal: a later non-overlapping gift). NOT yet
      -- premium; Slice 3B's resolver must treat 'scheduled' as non-premium.
      v_status := 'scheduled';
    ELSE
      v_status := 'active';
    END IF;
  END IF;

  SELECT count(DISTINCT e.show_id) INTO v_scored
  FROM public.entries e
  JOIN public.dogs d ON d.id = e.dog_id
  CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
  WHERE (d.owner_id = v_person_id OR d.co_owner_id = v_person_id)
    AND e.is_scored = true
    AND e.result_status IN ('qualified', 'nq', 'absent', 'excused', 'withdrawn')
    AND vis.qualification_visible;

  RETURN QUERY SELECT
    v_now,
    v_paid_tier,
    v_paid_expires,
    v_grant.grant_type,
    v_status,
    v_grant.starts_at,
    v_grant.ends_at,
    COALESCE(v_scored, 0);
END;
$$;

COMMENT ON FUNCTION public.get_own_entitlement_context() IS
  'Sanitized own-account entitlement projection for the unified resolver. '
  'Exposes source/status/start/end + scored-show count only; never reason or '
  'actor ids. grant_status is one of active|scheduled|expired|revoked|'
  'superseded; only "active" is currently Premium (scheduled = future-dated, '
  'not yet Premium — Slice 3B''s resolver must treat it as non-premium).';

REVOKE ALL ON FUNCTION public.get_own_entitlement_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_entitlement_context() TO authenticated;

-- =============================================================================
-- 4. Admin grant / revoke RPCs (only write paths)
-- =============================================================================

-- Grant (or explicitly replace) an entitlement. Site-admin only, reason required,
-- range validated, target must have an exhibitor profile, target person row
-- locked FOR UPDATE to serialize concurrent grants. Rejects an overlapping active
-- grant unless p_replace_active, in which case the prior overlapping grant is
-- marked superseded (NOT revoked). Naturally expired history is never modified.
CREATE OR REPLACE FUNCTION public.admin_grant_entitlement(
  p_person_id uuid,
  p_grant_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_replace_active boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_person_id uuid;
  v_new_id uuid;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = 'check_violation';
  END IF;

  IF p_grant_type NOT IN ('founding', 'complimentary') THEN
    RAISE EXCEPTION 'invalid grant_type %', p_grant_type USING ERRCODE = 'check_violation';
  END IF;

  IF p_ends_at IS NULL OR p_starts_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be after starts_at' USING ERRCODE = 'check_violation';
  END IF;

  -- A grant that has already fully ended authorizes nothing; reject it via the RPC.
  -- (Historical/backfill rows are written through privileged inserts, not here.)
  IF p_ends_at <= now() THEN
    RAISE EXCEPTION 'ends_at must be in the future' USING ERRCODE = 'check_violation';
  END IF;

  -- Target must be an exhibitor (exhibitor_profiles row exists).
  IF NOT EXISTS (
    SELECT 1 FROM public.exhibitor_profiles ep WHERE ep.person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'target has no exhibitor profile' USING ERRCODE = 'check_violation';
  END IF;

  v_admin_person_id := public.get_my_person_id();

  -- Serialize concurrent grant requests for this person.
  PERFORM 1 FROM public.people p WHERE p.id = p_person_id FOR UPDATE;

  -- Overlap = a non-revoked, non-superseded grant whose effective range overlaps
  -- the requested range. Naturally expired rows (ends_at <= p_starts_at) do not
  -- overlap and are therefore never touched.
  IF EXISTS (
    SELECT 1
    FROM public.subscription_entitlement_grants g
    WHERE g.person_id = p_person_id
      AND g.revoked_at IS NULL
      AND g.superseded_at IS NULL
      AND g.starts_at < p_ends_at
      AND g.ends_at > p_starts_at
  ) THEN
    IF NOT p_replace_active THEN
      RAISE EXCEPTION 'overlapping active grant exists' USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.subscription_entitlement_grants (
    person_id, grant_type, starts_at, ends_at, reason, granted_by_person_id
  )
  VALUES (
    p_person_id, p_grant_type, p_starts_at, p_ends_at, btrim(p_reason), v_admin_person_id
  )
  RETURNING id INTO v_new_id;

  -- Explicit replace: mark overlapping active grants superseded and link them to
  -- the successor. Not a revocation.
  IF p_replace_active THEN
    UPDATE public.subscription_entitlement_grants g
    SET superseded_at = now(),
        superseded_by_grant_id = v_new_id
    WHERE g.person_id = p_person_id
      AND g.id <> v_new_id
      AND g.revoked_at IS NULL
      AND g.superseded_at IS NULL
      AND g.starts_at < p_ends_at
      AND g.ends_at > p_starts_at;
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.admin_grant_entitlement(uuid, text, timestamptz, timestamptz, text, boolean) IS
  'Site-admin-only: create or explicitly replace a Premium grant. Locks the '
  'target person, rejects overlap unless replacing, records supersession (not '
  'revocation) on replace. Touches no Stripe row and no early_adopter_until.';

REVOKE ALL ON FUNCTION public.admin_grant_entitlement(uuid, text, timestamptz, timestamptz, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_entitlement(uuid, text, timestamptz, timestamptz, text, boolean) TO authenticated;

-- Revoke a currently-active grant. Site-admin only, reason required. Writes
-- revocation fields atomically; leaves expired/superseded history alone.
CREATE OR REPLACE FUNCTION public.admin_revoke_entitlement(
  p_grant_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_person_id uuid;
  v_person_id uuid;
  v_now timestamptz := now();
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the grant row (and thereby serialize with concurrent revoke/replace).
  -- Revocable = not already revoked, not superseded, and not naturally expired
  -- (ends_at > now). A future-dated grant (starts_at > now) IS revocable so an
  -- admin can undo a mistaken future gift; naturally expired history is never
  -- rewritten.
  SELECT g.person_id INTO v_person_id
  FROM public.subscription_entitlement_grants g
  WHERE g.id = p_grant_id
    AND g.revoked_at IS NULL
    AND g.superseded_at IS NULL
    AND g.ends_at > v_now
  FOR UPDATE;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'grant is not revocable (revoked, superseded, or expired)' USING ERRCODE = 'check_violation';
  END IF;

  v_admin_person_id := public.get_my_person_id();

  UPDATE public.subscription_entitlement_grants
  SET revoked_at = v_now,
      revoked_by_person_id = v_admin_person_id,
      revoke_reason = btrim(p_reason)
  WHERE id = p_grant_id;
END;
$$;

COMMENT ON FUNCTION public.admin_revoke_entitlement(uuid, text) IS
  'Site-admin-only: revoke a currently-active grant (reason required). Does not '
  'cancel Stripe billing and does not touch early_adopter_until.';

REVOKE ALL ON FUNCTION public.admin_revoke_entitlement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_entitlement(uuid, text) TO authenticated;

-- =============================================================================
-- 5. Backfill early_adopter_until -> founding grants
-- =============================================================================

-- starts_at choice: the person's account creation time (created_at) is used as
-- the founding-membership floor, clamped to at least 1 second before ends_at so
-- the range CHECK (ends_at > starts_at) always holds even if created_at is null
-- or not strictly before the end date. ends_at is the untouched early_adopter_until.
-- granted_by_person_id is NULL (no human actor for a system backfill).
INSERT INTO public.subscription_entitlement_grants (
  person_id, grant_type, starts_at, ends_at, reason, granted_by_person_id
)
SELECT
  p.id,
  'founding',
  LEAST(
    COALESCE(p.created_at, p.early_adopter_until - interval '1 year'),
    p.early_adopter_until - interval '1 second'
  ),
  p.early_adopter_until,
  'Backfilled from early_adopter_until',
  NULL
FROM public.people p
WHERE p.early_adopter_until IS NOT NULL;

-- Parity check: one founding backfill grant per non-null early_adopter_until.
DO $$
DECLARE
  v_legacy_count integer;
  v_grant_count integer;
BEGIN
  SELECT count(*) INTO v_legacy_count
  FROM public.people p
  WHERE p.early_adopter_until IS NOT NULL;

  SELECT count(*) INTO v_grant_count
  FROM public.subscription_entitlement_grants g
  WHERE g.grant_type = 'founding'
    AND g.reason = 'Backfilled from early_adopter_until';

  IF v_legacy_count <> v_grant_count THEN
    RAISE EXCEPTION
      'Backfill parity mismatch: % legacy early_adopter_until rows vs % founding grants',
      v_legacy_count, v_grant_count;
  END IF;

  RAISE NOTICE 'Entitlement backfill parity OK: % founding grants', v_grant_count;
END;
$$;

-- =============================================================================
-- 6. Premium INSERT/UPDATE enforcement (Decision 7A)
-- =============================================================================
-- Every table below is an exhibitor-owned direct supabase-js write. We add
-- has_effective_premium_access to INSERT and UPDATE only. SELECT and DELETE are
-- preserved verbatim so downgraded owners keep read + delete. The Analytics trial
-- cannot satisfy the helper, so trial-only users cannot create/edit these records.
--
-- Two policy shapes exist in the current schema:
--   (a) owner-scoped per-verb policies (auth.uid() = owner_id): pedigree,
--       training entries + milestones, manual_results, ofa/genetic screenings.
--       We drop+recreate only INSERT and UPDATE, adding the premium condition.
--   (b) a single FOR ALL "*_owner_access" policy (health: vaccinations,
--       medications, allergies, vet_visits) whose USING covers all four verbs.
--       There is no way to add premium to INSERT/UPDATE alone without splitting
--       it, so we replace the FOR ALL policy with four per-verb policies that
--       restate the exact ownership expression; SELECT/DELETE keep identical
--       semantics, INSERT/UPDATE additionally require premium (owners) while the
--       original platform-admin bypass is preserved.

-- ---- (a) owner-scoped tables (owner_id = auth.uid()) ------------------------

-- pedigree_ancestors (043)
DROP POLICY IF EXISTS "Users can create own pedigree ancestors" ON public.pedigree_ancestors;
CREATE POLICY "Users can create own pedigree ancestors"
  ON public.pedigree_ancestors FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

DROP POLICY IF EXISTS "Users can update own pedigree ancestors" ON public.pedigree_ancestors;
CREATE POLICY "Users can update own pedigree ancestors"
  ON public.pedigree_ancestors FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

-- training_journal_entries (041)
DROP POLICY IF EXISTS "Users can create own training entries" ON public.training_journal_entries;
CREATE POLICY "Users can create own training entries"
  ON public.training_journal_entries FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

DROP POLICY IF EXISTS "Users can update own training entries" ON public.training_journal_entries;
CREATE POLICY "Users can update own training entries"
  ON public.training_journal_entries FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

-- training_milestones (041) — separately writable
DROP POLICY IF EXISTS "Users can create own milestones" ON public.training_milestones;
CREATE POLICY "Users can create own milestones"
  ON public.training_milestones FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

DROP POLICY IF EXISTS "Users can update own milestones" ON public.training_milestones;
CREATE POLICY "Users can update own milestones"
  ON public.training_milestones FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

-- manual_results (042) — the real exhibitor manual-result write path
-- (LogManualResultPanel -> useCreateManualResultMutation -> createManualResult ->
-- supabase.from('manual_results'). NOT result_submissions, which is secretary-
-- authored and out of exhibitor scope.)
DROP POLICY IF EXISTS "Users can create own manual results" ON public.manual_results;
CREATE POLICY "Users can create own manual results"
  ON public.manual_results FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

DROP POLICY IF EXISTS "Users can update own manual results" ON public.manual_results;
CREATE POLICY "Users can update own manual results"
  ON public.manual_results FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

-- ofa_screenings (044)
DROP POLICY IF EXISTS "Users can create own OFA screenings" ON public.ofa_screenings;
CREATE POLICY "Users can create own OFA screenings"
  ON public.ofa_screenings FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

DROP POLICY IF EXISTS "Users can update own OFA screenings" ON public.ofa_screenings;
CREATE POLICY "Users can update own OFA screenings"
  ON public.ofa_screenings FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

-- genetic_screenings (044)
DROP POLICY IF EXISTS "Users can create own genetic screenings" ON public.genetic_screenings;
CREATE POLICY "Users can create own genetic screenings"
  ON public.genetic_screenings FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

DROP POLICY IF EXISTS "Users can update own genetic screenings" ON public.genetic_screenings;
CREATE POLICY "Users can update own genetic screenings"
  ON public.genetic_screenings FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (SELECT public.has_effective_premium_access(public.get_my_person_id()))
  );

-- ---- (b) health tables: split FOR ALL "*_owner_access" into per-verb ---------
-- Ownership expression restated verbatim from migration 023 (dogs owner/co-owner
-- via get_my_person_id, OR platform admin). Premium gate wraps as
-- (premium OR is_platform_admin) so the existing admin bypass is not weakened.

-- Defensive drops (these names were removed in migration 023 and not recreated;
-- guarded so this migration is safe to re-apply). 187's "*_secretary_select"
-- policies are intentionally left in place.
DROP POLICY IF EXISTS "vaccinations_select" ON public.vaccinations;
DROP POLICY IF EXISTS "vaccinations_insert" ON public.vaccinations;
DROP POLICY IF EXISTS "vaccinations_update" ON public.vaccinations;
DROP POLICY IF EXISTS "vaccinations_delete" ON public.vaccinations;
DROP POLICY IF EXISTS "medications_select" ON public.medications;
DROP POLICY IF EXISTS "medications_insert" ON public.medications;
DROP POLICY IF EXISTS "medications_update" ON public.medications;
DROP POLICY IF EXISTS "medications_delete" ON public.medications;
DROP POLICY IF EXISTS "allergies_select" ON public.allergies;
DROP POLICY IF EXISTS "allergies_insert" ON public.allergies;
DROP POLICY IF EXISTS "allergies_update" ON public.allergies;
DROP POLICY IF EXISTS "allergies_delete" ON public.allergies;
DROP POLICY IF EXISTS "vet_visits_select" ON public.vet_visits;
DROP POLICY IF EXISTS "vet_visits_insert" ON public.vet_visits;
DROP POLICY IF EXISTS "vet_visits_update" ON public.vet_visits;
DROP POLICY IF EXISTS "vet_visits_delete" ON public.vet_visits;

-- vaccinations
DROP POLICY IF EXISTS "vaccinations_owner_access" ON public.vaccinations;
CREATE POLICY "vaccinations_select" ON public.vaccinations
  FOR SELECT TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "vaccinations_delete" ON public.vaccinations
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "vaccinations_insert" ON public.vaccinations
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );
CREATE POLICY "vaccinations_update" ON public.vaccinations
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );

-- medications
DROP POLICY IF EXISTS "medications_owner_access" ON public.medications;
CREATE POLICY "medications_select" ON public.medications
  FOR SELECT TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "medications_delete" ON public.medications
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "medications_insert" ON public.medications
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );
CREATE POLICY "medications_update" ON public.medications
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );

-- allergies
DROP POLICY IF EXISTS "allergies_owner_access" ON public.allergies;
CREATE POLICY "allergies_select" ON public.allergies
  FOR SELECT TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "allergies_delete" ON public.allergies
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "allergies_insert" ON public.allergies
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );
CREATE POLICY "allergies_update" ON public.allergies
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );

-- vet_visits
DROP POLICY IF EXISTS "vet_visits_owner_access" ON public.vet_visits;
CREATE POLICY "vet_visits_select" ON public.vet_visits
  FOR SELECT TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "vet_visits_delete" ON public.vet_visits
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "vet_visits_insert" ON public.vet_visits
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );
CREATE POLICY "vet_visits_update" ON public.vet_visits
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT public.get_my_person_id())
         OR co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      dog_id IN (
        SELECT id FROM public.dogs
        WHERE owner_id = (SELECT public.get_my_person_id())
           OR co_owner_id = (SELECT public.get_my_person_id())
      )
      OR (SELECT public.is_platform_admin())
    )
    AND (
      (SELECT public.has_effective_premium_access(public.get_my_person_id()))
      OR (SELECT public.is_platform_admin())
    )
  );
