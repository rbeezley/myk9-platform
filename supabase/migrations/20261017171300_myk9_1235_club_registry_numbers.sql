-- MYK9-1235: club registry numbers, one row per club per organization.
--
-- clubs.club_number (migration 026) is one free-text field with no
-- organization and no uniqueness rule, but AKC, UKC and ASCA each issue their
-- own club ID and a club can hold several. This adds public.club_registry_numbers
-- (club_id, organization, number), unique on (club_id, organization), carries
-- the two existing clubs.club_number values over as AKC numbers (owner
-- decision 2026-10-17), and makes both new-club request paths carry numbers:
--   * club_access_requests.club_numbers + submit_club_access_request(...,
--     p_club_numbers); an AFTER UPDATE trigger copies them to the approved club on
--     approval (new club: all; existing club: only organizations it lacks). review_club_access_request is deliberately NOT redefined here:
--     PR #3103 (MYK9-1208) also replaces it (adding require_recent_reauth()),
--     and a copy from the pre-1208 body would silently drop that gate;
--   * onboarding_requests.club_numbers, enforced by a BEFORE INSERT trigger.
--
-- clubs.club_number is NOT dropped here. The app stops reading and writing it;
-- the DROP is a separate, separately confirmed migration (MYK9-1235).
--
-- Reads: registry numbers are printed on premiums and shown on the public club
-- page, so they are readable wherever the club row itself is readable (anon
-- included; the policy defers to clubs_select). Writes: the club's own
-- club_admin and site admins, the same people clubs_update admits.
--
-- NOT PUSHED by the authoring agent.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_registry_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  organization text NOT NULL,
  number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_registry_numbers_organization_check
    CHECK (organization IN ('AKC', 'UKC', 'ASCA')),
  CONSTRAINT club_registry_numbers_number_check
    CHECK (number = btrim(number) AND length(number) BETWEEN 1 AND 50),
  CONSTRAINT club_registry_numbers_club_org_key UNIQUE (club_id, organization)
);

COMMENT ON TABLE public.club_registry_numbers IS
  'MYK9-1235: a club''s ID in each registry (AKC, UKC, ASCA), one row per club per organization. Replaces the single free-text clubs.club_number.';

DROP TRIGGER IF EXISTS club_registry_numbers_updated_at ON public.club_registry_numbers;
CREATE TRIGGER club_registry_numbers_updated_at
  BEFORE UPDATE ON public.club_registry_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Carry the existing values over as AKC numbers (owner decision
--    2026-10-17). Runs before RLS is forced on the new table so a
--    migrations-only rebuild owner is not filtered out.
-- ---------------------------------------------------------------------------
INSERT INTO public.club_registry_numbers (club_id, organization, number)
SELECT id, 'AKC', btrim(left(btrim(club_number), 50))
FROM public.clubs
WHERE nullif(btrim(club_number), '') IS NOT NULL
ON CONFLICT (club_id, organization) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. RLS, grants.
-- ---------------------------------------------------------------------------
ALTER TABLE public.club_registry_numbers ENABLE ROW LEVEL SECURITY;
-- FORCE so the migrations-only rebuild owner is subject to the policies too.
ALTER TABLE public.club_registry_numbers FORCE ROW LEVEL SECURITY;

-- The project's ALTER DEFAULT PRIVILEGES hands anon full CRUD on every new
-- table, so name the intended ACL: anon may only SELECT, authenticated may
-- read and (through the policies below) write.
REVOKE ALL ON public.club_registry_numbers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.club_registry_numbers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_registry_numbers TO authenticated;
GRANT ALL ON public.club_registry_numbers TO service_role;

DROP POLICY IF EXISTS club_registry_numbers_select ON public.club_registry_numbers;
CREATE POLICY club_registry_numbers_select ON public.club_registry_numbers
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_registry_numbers.club_id));

COMMENT ON POLICY club_registry_numbers_select ON public.club_registry_numbers IS
  'MYK9-1235: a club''s registry numbers are visible exactly where the club row is (clubs_select applies inside the EXISTS). Public IDs printed on premiums, not private data.';

DROP POLICY IF EXISTS club_registry_numbers_insert ON public.club_registry_numbers;
CREATE POLICY club_registry_numbers_insert ON public.club_registry_numbers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_site_admin()) OR public.is_club_admin(club_id));

DROP POLICY IF EXISTS club_registry_numbers_update ON public.club_registry_numbers;
CREATE POLICY club_registry_numbers_update ON public.club_registry_numbers
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_site_admin()) OR public.is_club_admin(club_id))
  WITH CHECK ((SELECT public.is_site_admin()) OR public.is_club_admin(club_id));

DROP POLICY IF EXISTS club_registry_numbers_delete ON public.club_registry_numbers;
CREATE POLICY club_registry_numbers_delete ON public.club_registry_numbers
  FOR DELETE TO authenticated
  USING ((SELECT public.is_site_admin()) OR public.is_club_admin(club_id));

COMMENT ON POLICY club_registry_numbers_insert ON public.club_registry_numbers IS
  'MYK9-1235: writes mirror clubs_update (a club''s own club_admin, or a site admin). is_site_admin() is wrapped in a scalar subquery (InitPlan); is_club_admin(club_id) is correlated on the row and called bare.';

-- ---------------------------------------------------------------------------
-- 4. Shared request-shape validator. Accepts NULL / {} / {"AKC": "123", ...},
--    drops blank values, trims, and refuses unknown organizations or non-text
--    values. Returns only the non-empty entries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_club_numbers(p_numbers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_text text;
BEGIN
  IF p_numbers IS NULL OR jsonb_typeof(p_numbers) = 'null' THEN
    RETURN v_result;
  END IF;
  IF jsonb_typeof(p_numbers) <> 'object' THEN
    RAISE EXCEPTION 'Club numbers must be an object keyed by organization'
      USING ERRCODE = '22023';
  END IF;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_numbers) LOOP
    IF v_key NOT IN ('AKC', 'UKC', 'ASCA') THEN
      RAISE EXCEPTION 'Unknown organization %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_val) = 'null' THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_val) <> 'string' THEN
      RAISE EXCEPTION 'The % club number must be text', v_key USING ERRCODE = '22023';
    END IF;
    v_text := btrim(v_val #>> '{}');
    IF length(v_text) > 50 THEN
      RAISE EXCEPTION 'The % club number is too long', v_key USING ERRCODE = '22023';
    END IF;
    IF v_text <> '' THEN
      v_result := v_result || jsonb_build_object(v_key, v_text);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.normalize_club_numbers(jsonb) IS
  'MYK9-1235: validates and trims a {AKC|UKC|ASCA: text} club-number object and drops blank entries. Shared by submit_club_access_request and the onboarding_requests insert trigger so both new-club paths agree on the shape.';

REVOKE ALL ON FUNCTION public.normalize_club_numbers(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_club_numbers(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_club_numbers(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The club-access request path ("Set up a new club" on /request-access).
-- ---------------------------------------------------------------------------
ALTER TABLE public.club_access_requests
  ADD COLUMN IF NOT EXISTS club_numbers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.club_access_requests.club_numbers IS
  'MYK9-1235: {AKC|UKC|ASCA: number} the requester gave for the new club. Copied to club_registry_numbers when a site admin approves a request that creates a club. {} for requests that predate the field or came from the signup trigger.';

-- The new overload takes p_club_numbers with NO default: a default would make a
-- 3-argument call ambiguous between the two. The old 3-argument signature stays,
-- as a thin wrapper, so an old frontend gets a clear message rather than a 404
-- while the frontend deploy and `db push` land in either order.
-- Copied from 20260525140000_club_access_requests_submit_rpc.sql, the latest
-- definition; only p_club_numbers and its validation/insert are new.
CREATE OR REPLACE FUNCTION public.submit_club_access_request(
  p_requested_club_name text,
  p_requested_club_website text,
  p_request_note text,
  p_club_numbers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_auth_uid uuid;
  v_person_id uuid;
  v_pending_count int;
  v_normalized_name text;
  v_normalized_website text;
  v_normalized_note text;
  v_normalized_numbers jsonb;
  v_new_id uuid;
BEGIN
  v_caller_auth_uid := (SELECT auth.uid());
  IF v_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_normalized_name := nullif(trim(coalesce(p_requested_club_name, '')), '');
  v_normalized_website := nullif(trim(coalesce(p_requested_club_website, '')), '');
  v_normalized_note := nullif(trim(coalesce(p_request_note, '')), '');

  IF v_normalized_name IS NULL OR length(v_normalized_name) < 2 THEN
    RAISE EXCEPTION 'Club name must be at least 2 characters'
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-1235: at least one organization's club number is required.
  v_normalized_numbers := public.normalize_club_numbers(p_club_numbers);
  IF v_normalized_numbers = '{}'::jsonb THEN
    RAISE EXCEPTION 'Enter at least one club number'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_person_id
  FROM public.people
  WHERE auth_user_id = v_caller_auth_uid
    AND deleted_at IS NULL;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'No person profile found for this user'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('club_access_requests:submit:' || v_caller_auth_uid::text)
  );

  SELECT count(*) INTO v_pending_count
  FROM public.club_access_requests
  WHERE requester_auth_user_id = v_caller_auth_uid
    AND status = 'pending';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending club access requests (max 3). Wait for review before submitting more.'
      USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.club_access_requests (
    requester_person_id,
    requester_auth_user_id,
    requested_club_name,
    requested_club_website,
    request_note,
    club_numbers
  ) VALUES (
    v_person_id,
    v_caller_auth_uid,
    v_normalized_name,
    v_normalized_website,
    v_normalized_note,
    v_normalized_numbers
  )
  ON CONFLICT (requester_person_id, (lower(requested_club_name))) WHERE status = 'pending'
  DO NOTHING
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_club_access_request(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_club_access_request(text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_club_access_request(text, text, text, jsonb) TO authenticated;

-- Legacy 3-argument signature, same identity as before (grants restated below):
-- a client that predates the club-number field is told what is missing.
CREATE OR REPLACE FUNCTION public.submit_club_access_request(
  p_requested_club_name text,
  p_requested_club_website text DEFAULT NULL,
  p_request_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Enter at least one club number'
    USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_club_access_request(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_club_access_request(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_club_access_request(text, text, text) TO authenticated;

-- Approval copies the request's numbers to the approved club. A trigger
-- rather than a change to review_club_access_request (see the header). That
-- RPC sets status = 'approved' and approved_club_id on the pending -> approved
-- flip only; re-approval does not change status, so it cannot fire this twice.
-- Fill-blanks rule, no heuristic: ON CONFLICT DO NOTHING means a new club gets
-- every number, and an existing club the admin picked gets only the
-- organizations it does not already have; its own numbers are never overwritten.
CREATE OR REPLACE FUNCTION public.copy_request_club_numbers_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.club_registry_numbers (club_id, organization, number)
  SELECT NEW.approved_club_id, kv.key, kv.value
  FROM jsonb_each_text(NEW.club_numbers) AS kv
  ON CONFLICT (club_id, organization) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.copy_request_club_numbers_on_approval() IS
  'MYK9-1235: AFTER UPDATE on club_access_requests, pending -> approved with approved_club_id set. Copies club_numbers to club_registry_numbers for organizations the club does not already have (ON CONFLICT DO NOTHING): a new club gets all, an existing club chosen at approval has its blanks filled and is never overwritten.';

REVOKE ALL ON FUNCTION public.copy_request_club_numbers_on_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_copy_request_club_numbers_on_approval ON public.club_access_requests;
CREATE TRIGGER trg_copy_request_club_numbers_on_approval
  AFTER UPDATE OF status ON public.club_access_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'approved' AND NEW.approved_club_id IS NOT NULL)
  EXECUTE FUNCTION public.copy_request_club_numbers_on_approval();

-- ---------------------------------------------------------------------------
-- 6. The onboarding path (public "Add your club" form). The row is inserted
--    straight into the table under the owner's RLS policy, so the rule is a
--    BEFORE INSERT trigger. INSERT only: rows filed before this change have
--    no numbers and an admin must still be able to update their status.
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_requests
  ADD COLUMN IF NOT EXISTS club_numbers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.onboarding_requests.club_numbers IS
  'MYK9-1235: {AKC|UKC|ASCA: number} the requester gave for the club. At least one is required on INSERT (enforce_onboarding_club_numbers); {} on rows filed before the rule.';

CREATE OR REPLACE FUNCTION public.enforce_onboarding_club_numbers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.club_numbers := public.normalize_club_numbers(NEW.club_numbers);
  IF NEW.club_numbers = '{}'::jsonb THEN
    RAISE EXCEPTION 'Enter at least one club number'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_onboarding_club_numbers() IS
  'MYK9-1235: BEFORE INSERT on onboarding_requests. Normalizes club_numbers and refuses a request with none. SECURITY INVOKER; INSERT only so legacy rows stay editable.';

REVOKE ALL ON FUNCTION public.enforce_onboarding_club_numbers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_onboarding_club_numbers() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_onboarding_club_numbers() FROM authenticated;

DROP TRIGGER IF EXISTS trg_enforce_onboarding_club_numbers ON public.onboarding_requests;
CREATE TRIGGER trg_enforce_onboarding_club_numbers
  BEFORE INSERT ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_onboarding_club_numbers();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify against the APPLIED database, never the migration text:
--
--   select unnest(relacl)::text from pg_class where oid = 'public.club_registry_numbers'::regclass;
--   select club_id, organization, number from public.club_registry_numbers;
--   -- expect one AKC row per club that had a non-blank clubs.club_number.
--
-- Production values to check BEFORE the (separate) DROP of clubs.club_number:
--   select id, name, club_number from public.clubs where nullif(btrim(club_number), '') is not null;
