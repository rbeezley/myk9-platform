-- MYK9-1950: per-judge passcodes, server half (split from MYK9-1755).
--
-- WHY
-- A show had ONE judge passcode (show_passcodes unique (show_id, role)), and a judge claim
-- scored every class in the show. The club mock show runs several rings with a separate judge in
-- each (owner, 2026-11-13), so a judge's code must score only the classes that judge is assigned.
--
-- DESIGN (owner's design in MYK9-1755: scope checked LIVE at write time)
--   * show_passcodes.person_id (nullable). Set for role 'judge', NULL for every other role.
--     Uniqueness: one judge code per (show, person); one code per (show, role) for admin, steward
--     and exhibitor. The old UNIQUE (show_id, role) constraint becomes two partial unique indexes.
--     Grants, RLS and anon access are untouched (no table is created).
--   * Judge codes follow judge_assignments, automatically. An AFTER trigger on judge_assignments
--     ensures a judge has a code while they hold at least one confirmed/invited CLASS-level
--     assignment (class_id NOT NULL) in the show, and retires the code (deletes the row) when the
--     last one goes. A show-level row (class_id NULL, the wizard's judge panel written by
--     persistShowJudgeAssignments / create_show_with_children p_judge_ids) is a roster entry, not a
--     class: set_class_judge and the wizard's per-class pick write class-level rows, which is the
--     norm (one judge per class). The gate accepts only class-level rows, so code generation uses
--     the same rows; a panel-only judge gets no code that could not score anything.
--     Minting is best-effort: a failure (Vault pepper unset, generator exhausted) logs a WARNING
--     and never fails the assignment write. get_show_access_codes and regenerate_show_passcodes
--     mint any missing code on demand. A code that
--     already exists is never rewritten by an assignment change, so reassigning a class moves the
--     class between judges WITHOUT regenerating anything.
--   * The claim carries the judge: validate_passcode returns person_id and the validate-passcode
--     edge function stamps it as app_metadata.ringside_person_id.
--   * ringside_update_entry lets a per-judge claim write only when the entry's class is assigned to
--     that person RIGHT NOW (judge_assignments, status confirmed/invited). Otherwise it raises
--     SQLSTATE RS403 with message 'This class is judged by <name>' (or 'This class has no judge
--     assigned'), DETAIL = the assigned judge's person id. The admin code still scores any class;
--     the steward code is unchanged. A judge claim with no person id (the old show-wide shape) is
--     refused as a revoked code.
--   * Revocation is per code. ringside_claim_generation_current now matches the claim's person
--     too, so regenerate_judge_passcode (new) bumps ONE row's created_at and only that judge's
--     sessions go stale. Retiring a code (the row is gone) revokes its sessions the same way.
--   * The old show-wide judge code is deleted by this migration. Existing judge assignments are
--     backfilled with per-judge codes at the end.
--   * MYK9-1754 audit rows gain passcode_id and passcode_person_id for passcode writes. No foreign
--     key: the audit row must outlive a retired code.
--
-- ONE JUDGE PER CLASS (MYK9-1466 / MYK9-1327): already enforced by the database.
-- judge_assignments_one_confirmed_judge_per_class (20261028185300) is a partial unique index on
-- (class_id) WHERE class_id IS NOT NULL AND status = 'confirmed', and set_class_judge replaces the
-- class's rows in one transaction. It deliberately leaves 'invited' rows unconstrained, and this
-- migration does not change that (a class can hold a confirmed judge and a pending invitation).
--
-- Function bodies are copied from the LATEST migration defining each one:
--   validate_passcode, ringside_claim_generation_current, upsert_ringside_session:
--     20260710160000_ringside_passcode_generation_revocation_complete.sql
--   insert_show_passcodes, regenerate_show_passcodes: 20260727160000_recoverable_show_access_codes.sql
--   get_show_access_codes: 20260830240000_show_officials_separates_label_from_permission.sql
--   ringside_update_entry: 20261108031700_myk9_1759_score_audit_trigger.sql

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table: person_id, uniqueness, retire the show-wide judge code.
-- -----------------------------------------------------------------------------
ALTER TABLE public.show_passcodes
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.show_passcodes.person_id IS
  'MYK9-1950: the judge a role=judge code belongs to; NULL for admin/steward/exhibitor codes.';

-- Drop the old UNIQUE (show_id, role) by its columns, not its generated name.
DO $drop_unique$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.show_passcodes'::regclass
       AND c.contype = 'u'
       AND (
         SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
          WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       ) = ARRAY['role', 'show_id']
  LOOP
    EXECUTE format('ALTER TABLE public.show_passcodes DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$drop_unique$;

-- The old show-wide judge code goes. Its sessions keep their row (show_passcode_id SET NULL)
-- and are refused at the next write: a judge claim without a person id is a revoked code.
DELETE FROM public.show_passcodes WHERE role = 'judge' AND person_id IS NULL;

-- A judge code names its judge and no other code does. After the DELETE above no row violates it.
ALTER TABLE public.show_passcodes
  DROP CONSTRAINT IF EXISTS show_passcodes_judge_person_check;
ALTER TABLE public.show_passcodes
  ADD CONSTRAINT show_passcodes_judge_person_check
  CHECK ((role = 'judge') = (person_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS show_passcodes_one_code_per_role_idx
  ON public.show_passcodes (show_id, role)
  WHERE role <> 'judge';

CREATE UNIQUE INDEX IF NOT EXISTS show_passcodes_one_code_per_judge_idx
  ON public.show_passcodes (show_id, person_id)
  WHERE person_id IS NOT NULL;

COMMENT ON TABLE public.show_passcodes IS
  'Hashed ringside access codes: one admin, steward and exhibitor code per show, and one judge '
  'code per judge per show (person_id, MYK9-1950). RLS enabled with no policies = deny-all to '
  'anon/authenticated by design; written/read only via SECURITY DEFINER functions and '
  'service-role edge functions. FORCE RLS on.';

-- -----------------------------------------------------------------------------
-- 2. Audit: name the passcode and the judge on passcode writes (MYK9-1754).
--    ADD COLUMN inherits the table-level SELECT grant; no grant changes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.entry_score_audit
  ADD COLUMN IF NOT EXISTS passcode_id uuid,
  ADD COLUMN IF NOT EXISTS passcode_person_id uuid;

COMMENT ON COLUMN public.entry_score_audit.passcode_id IS
  'MYK9-1950: show_passcodes.id of the code a passcode write used. No FK: the audit outlives a retired code.';
COMMENT ON COLUMN public.entry_score_audit.passcode_person_id IS
  'MYK9-1950: the judge a per-judge passcode belongs to (people.id); NULL for other tiers.';

-- -----------------------------------------------------------------------------
-- 3. Per-judge code lifecycle.
-- -----------------------------------------------------------------------------

-- Ensure (or retire) one judge's code for one show. Idempotent. Never rewrites an existing code.
CREATE OR REPLACE FUNCTION public._sync_judge_passcode(p_show_id uuid, p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assigned boolean;
  v_code record;
BEGIN
  IF p_show_id IS NULL OR p_person_id IS NULL THEN
    RETURN;
  END IF;

  -- Two assignment writes for one judge must not both generate a code.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('judge_passcode:' || p_show_id::text || ':' || p_person_id::text, 0)
  );

  v_assigned := EXISTS (
    SELECT 1
      FROM public.judge_assignments ja
      JOIN public.people pe ON pe.id = ja.person_id
      JOIN public.shows s ON s.id = ja.show_id
     WHERE ja.show_id = p_show_id
       AND ja.person_id = p_person_id
       AND ja.class_id IS NOT NULL
       AND ja.status IN ('confirmed', 'invited')
       AND pe.deleted_at IS NULL
       AND s.deleted_at IS NULL
  );

  IF v_assigned THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.show_passcodes sp
       WHERE sp.show_id = p_show_id AND sp.person_id = p_person_id
    ) THEN
      SELECT * INTO v_code FROM public._generate_unique_role_code('judge');
      INSERT INTO public.show_passcodes (
        show_id, role, passcode_hash, passcode_ciphertext, person_id
      ) VALUES (
        p_show_id, 'judge', v_code.hash,
        public._encrypt_show_passcode(v_code.plaintext), p_person_id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    DELETE FROM public.show_passcodes sp
     WHERE sp.show_id = p_show_id AND sp.person_id = p_person_id;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public._sync_judge_passcode(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Best-effort sync: minting needs the Vault pepper and secret and a free code, and any of those
-- can fail (SQLSTATE 55000 when unset). Callers that must not fail because of a code (the
-- judge_assignments trigger, the one-time backfill, the on-demand catch-up) use this wrapper.
CREATE OR REPLACE FUNCTION public._try_sync_judge_passcode(p_show_id uuid, p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public._sync_judge_passcode(p_show_id, p_person_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'MYK9-1950: judge passcode sync failed for show % person % (%): %',
      p_show_id, p_person_id, SQLSTATE, SQLERRM;
  END;
END
$$;

REVOKE ALL ON FUNCTION public._try_sync_judge_passcode(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Sync every judge of one show (new-show path, and a catch-up for regenerate and the codes list).
-- Best-effort, and the per-judge advisory locks are taken in person_id order so two concurrent
-- syncs cannot deadlock.
CREATE OR REPLACE FUNCTION public._sync_show_judge_passcodes(p_show_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  FOR v_person_id IN
    SELECT u.person_id FROM (
      SELECT ja.person_id FROM public.judge_assignments ja
       WHERE ja.show_id = p_show_id AND ja.person_id IS NOT NULL
      UNION
      SELECT sp.person_id FROM public.show_passcodes sp
       WHERE sp.show_id = p_show_id AND sp.person_id IS NOT NULL
    ) u
    ORDER BY u.person_id
  LOOP
    PERFORM public._try_sync_judge_passcode(p_show_id, v_person_id);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public._sync_show_judge_passcodes(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.judge_assignments_sync_passcodes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public._try_sync_judge_passcode(NEW.show_id, NEW.person_id);
  END IF;
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE'
         AND (OLD.show_id IS DISTINCT FROM NEW.show_id
              OR OLD.person_id IS DISTINCT FROM NEW.person_id)) THEN
    PERFORM public._try_sync_judge_passcode(OLD.show_id, OLD.person_id);
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.judge_assignments_sync_passcodes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS judge_assignments_sync_passcodes ON public.judge_assignments;
CREATE TRIGGER judge_assignments_sync_passcodes
  AFTER INSERT OR DELETE OR UPDATE OF person_id, show_id, class_id, status
  ON public.judge_assignments
  FOR EACH ROW EXECUTE FUNCTION public.judge_assignments_sync_passcodes();

-- Regenerate ONE judge's code. Only that code's sessions go stale (created_at is the generation).
-- created_at uses clock_timestamp() and always moves forward, so it differs from the previous
-- generation even inside one transaction.
CREATE OR REPLACE FUNCTION public.regenerate_judge_passcode(p_show_id uuid, p_person_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code record;
  v_updated integer;
BEGIN
  IF p_show_id IS NULL OR p_person_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id and p_person_id are required' USING errcode = '22023';
  END IF;

  IF NOT public._can_manage_show_passcodes(p_show_id) THEN
    RAISE EXCEPTION 'not authorized to manage passcodes for show %', p_show_id
      USING errcode = '42501';
  END IF;

  PERFORM public._sync_judge_passcode(p_show_id, p_person_id);

  SELECT * INTO v_code FROM public._generate_unique_role_code('judge');

  UPDATE public.show_passcodes sp
     SET passcode_hash = v_code.hash,
         passcode_ciphertext = public._encrypt_show_passcode(v_code.plaintext),
         created_at = greatest(clock_timestamp(), sp.created_at + interval '1 microsecond')
   WHERE sp.show_id = p_show_id AND sp.person_id = p_person_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'person % is not assigned to show % as a judge', p_person_id, p_show_id
      USING errcode = 'P0002';
  END IF;

  RETURN v_code.plaintext;
END
$$;

REVOKE ALL ON FUNCTION public.regenerate_judge_passcode(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_judge_passcode(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.regenerate_judge_passcode(uuid, uuid) IS
  'MYK9-1950: new code for ONE judge in one show, returned once. Revokes only that code''s ringside '
  'sessions (generation is per code). Caller must manage the show''s passcodes.';

-- -----------------------------------------------------------------------------
-- 4. insert_show_passcodes / regenerate_show_passcodes: the non-judge codes, plus judge sync.
--    The judge column of the result stays for the client's row shape and is NULL: judge codes
--    are per judge now and are read through get_show_access_codes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_show_passcodes(p_show_id uuid)
RETURNS TABLE (
  admin     text,
  judge     text,
  steward   text,
  exhibitor text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin     record;
  v_steward   record;
  v_exhibitor record;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING errcode = '22023';
  END IF;

  IF NOT public._can_manage_show_passcodes(p_show_id) THEN
    RAISE EXCEPTION 'not authorized to manage passcodes for show %', p_show_id
      USING errcode = '42501';
  END IF;

  -- Judge codes may already exist (the wizard assigns judges before this call), so only the
  -- shared role codes decide whether the show "already has passcodes".
  IF EXISTS (
    SELECT 1 FROM public.show_passcodes sp
     WHERE sp.show_id = p_show_id AND sp.role <> 'judge'
  ) THEN
    RAISE EXCEPTION 'show % already has passcodes; use regenerate_show_passcodes', p_show_id
      USING errcode = '23505';
  END IF;

  v_admin     := public._generate_unique_role_code('admin');
  v_steward   := public._generate_unique_role_code('steward');
  v_exhibitor := public._generate_unique_role_code('exhibitor');

  INSERT INTO public.show_passcodes (show_id, role, passcode_hash, passcode_ciphertext) VALUES
    (p_show_id, 'admin',     v_admin.hash,     public._encrypt_show_passcode(v_admin.plaintext)),
    (p_show_id, 'steward',   v_steward.hash,   public._encrypt_show_passcode(v_steward.plaintext)),
    (p_show_id, 'exhibitor', v_exhibitor.hash, public._encrypt_show_passcode(v_exhibitor.plaintext));

  PERFORM public._sync_show_judge_passcodes(p_show_id);

  RETURN QUERY
    SELECT v_admin.plaintext, NULL::text, v_steward.plaintext, v_exhibitor.plaintext;
END
$$;

REVOKE ALL ON FUNCTION public.insert_show_passcodes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_show_passcodes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_show_passcodes(p_show_id uuid)
RETURNS TABLE (
  admin     text,
  judge     text,
  steward   text,
  exhibitor text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin     record;
  v_steward   record;
  v_exhibitor record;
  v_judge     record;
  v_code      record;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING errcode = '22023';
  END IF;

  IF NOT public._can_manage_show_passcodes(p_show_id) THEN
    RAISE EXCEPTION 'not authorized to manage passcodes for show %', p_show_id
      USING errcode = '42501';
  END IF;

  v_admin     := public._generate_unique_role_code('admin');
  v_steward   := public._generate_unique_role_code('steward');
  v_exhibitor := public._generate_unique_role_code('exhibitor');

  INSERT INTO public.show_passcodes (show_id, role, passcode_hash, passcode_ciphertext) VALUES
    (p_show_id, 'admin',     v_admin.hash,     public._encrypt_show_passcode(v_admin.plaintext)),
    (p_show_id, 'steward',   v_steward.hash,   public._encrypt_show_passcode(v_steward.plaintext)),
    (p_show_id, 'exhibitor', v_exhibitor.hash, public._encrypt_show_passcode(v_exhibitor.plaintext))
  ON CONFLICT (show_id, role) WHERE role <> 'judge' DO UPDATE
    SET passcode_hash = excluded.passcode_hash,
        passcode_ciphertext = excluded.passcode_ciphertext,
        created_at = now();

  -- "Regenerate all": every judge code of the show is replaced too (a missing one is created
  -- first), so the secretary's reset still cuts off every device.
  PERFORM public._sync_show_judge_passcodes(p_show_id);
  FOR v_judge IN
    SELECT sp.id FROM public.show_passcodes sp
     WHERE sp.show_id = p_show_id AND sp.person_id IS NOT NULL
  LOOP
    v_code := public._generate_unique_role_code('judge');
    UPDATE public.show_passcodes sp
       SET passcode_hash = v_code.hash,
           passcode_ciphertext = public._encrypt_show_passcode(v_code.plaintext),
           created_at = greatest(clock_timestamp(), sp.created_at + interval '1 microsecond')
     WHERE sp.id = v_judge.id;
  END LOOP;

  RETURN QUERY
    SELECT v_admin.plaintext, NULL::text, v_steward.plaintext, v_exhibitor.plaintext;
END
$$;

REVOKE ALL ON FUNCTION public.regenerate_show_passcodes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_show_passcodes(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. validate_passcode: carry the judge's person_id. Return columns change, so DROP + CREATE;
--    the service-role-only grant is re-declared.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.validate_passcode(text);

CREATE FUNCTION public.validate_passcode(p_code text)
RETURNS TABLE (show_id uuid, role text, passcode_generation timestamptz, person_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_hash text;
begin
  v_hash := public._hash_passcode(p_code);
  if v_hash is null then
    return;
  end if;

  return query
    select sp.show_id, sp.role, sp.created_at, sp.person_id
      from public.show_passcodes sp
      join public.shows s on s.id = sp.show_id
     where sp.passcode_hash = v_hash
       and s.deleted_at is null
     limit 1;
end
$$;

REVOKE ALL ON FUNCTION public.validate_passcode(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_passcode(text) TO service_role;

COMMENT ON FUNCTION public.validate_passcode(text) IS
  'Looks up a 5-char show passcode via HMAC-SHA256 hash and returns '
  '(show_id, role, passcode_generation=created_at, person_id) or no rows. person_id is the judge '
  'a per-judge code belongs to (NULL for other roles). Returned ATOMICALLY with the hash match so '
  'the edge function stamps the generation the code was valid for. Service-role-only: invoke from '
  'the rate-limited validate-passcode edge function.';

-- -----------------------------------------------------------------------------
-- 6. ringside_claim_generation_current: the claim must match ITS code (per-code revocation).
--    A retired code (row gone) and a pre-1950 judge claim (no person id) both read as revoked.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ringside_claim_generation_current()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'kind') IS DISTINCT FROM 'ringside_passcode'
      THEN NULL
    ELSE EXISTS (
      SELECT 1
        FROM public.show_passcodes sp
       WHERE sp.show_id::text = nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '')
         AND sp.role = (auth.jwt() -> 'app_metadata' ->> 'ringside_role')
         AND sp.person_id::text IS NOT DISTINCT FROM
             nullif((auth.jwt() -> 'app_metadata' ->> 'ringside_person_id'), '')
         AND (auth.jwt() -> 'app_metadata' ->> 'passcode_generation') IS NOT NULL
         AND (auth.jwt() -> 'app_metadata' ->> 'passcode_generation')::timestamptz = sp.created_at
    )
  END;
$$;

COMMENT ON FUNCTION public.ringside_claim_generation_current() IS
  'Returns TRUE when the caller''s ringside_passcode app_metadata claim carries a '
  'passcode_generation that still matches the live show_passcodes.created_at of ITS code '
  '(show_id, role and, for judges, ringside_person_id: MYK9-1950); FALSE when the claim is '
  'stale/missing or its code was retired (revoked, fail closed); NULL when there is no '
  'ringside_passcode claim.';

REVOKE ALL ON FUNCTION public.ringside_claim_generation_current() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ringside_claim_generation_current() TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. upsert_ringside_session (from 20260710160000): link the session to ITS code.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_ringside_session(
  p_passcode_or_null text,
  p_subscription_endpoint text,
  p_favorited_armbands text[] default '{}'::text[],
  p_route text default null
)
returns table (show_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_user_id uuid;
  v_show_id uuid;
  v_role text;
  v_show_passcode_id uuid;
  -- Ringside passcode claim (forge-proof app_metadata; service-role set only).
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_claim_person_id uuid;
begin
  if nullif(trim(coalesce(p_subscription_endpoint, '')), '') is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  select ps.id, ps.user_id
    into v_subscription_id, v_subscription_user_id
    from public.push_subscriptions ps
   where ps.endpoint = p_subscription_endpoint
   limit 1;

  if v_subscription_id is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  -- Read the ringside passcode claim from the (forge-proof) app_metadata, NEVER
  -- user_metadata. Gated on the explicit kind='ringside_passcode' marker
  -- (show_id/ringside_role are generic key names; the marker is what makes the
  -- claim unambiguously "from a ringside passcode"). Mirrors mig 20260624163000.
  v_claim_kind := (auth.jwt() -> 'app_metadata' ->> 'kind');
  v_claim_show_id := nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (auth.jwt() -> 'app_metadata' ->> 'ringside_role');
  -- MYK9-1950: a judge claim names the judge whose code minted it.
  v_claim_person_id := nullif((auth.jwt() -> 'app_metadata' ->> 'ringside_person_id'), '')::uuid;

  if v_claim_kind = 'ringside_passcode'
     and v_claim_show_id is not null
     and v_claim_role in ('judge', 'steward', 'admin', 'exhibitor') then
    -- Passcode-claim arm (the primary ringside sign-in). The caller is a signed-in
    -- anonymous session; anonymous users carry an auth.uid(), and the push
    -- subscription must belong to that session.
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    -- Generation revocation (J1.3): the claim authorizes ONLY while its stamped
    -- passcode_generation still matches the current show_passcodes.created_at.
    -- regenerate_show_passcodes bumps created_at in place, so a claim minted from a
    -- since-regenerated code is stale and must be rejected — otherwise a compromised
    -- device the secretary tried to cut off keeps its presence + read.
    if public.ringside_claim_generation_current() is distinct from true then
      raise exception 'Passcode has been regenerated; re-enter a new code'
        using errcode = '42501';
    end if;

    v_show_id := v_claim_show_id::uuid;
    v_role := v_claim_role;

    -- Preserve the show_passcode linkage without needing the raw passcode:
    -- (show_id, role, person_id) names at most one row (MYK9-1950).
    select sp.id
      into v_show_passcode_id
      from public.show_passcodes sp
     where sp.show_id = v_show_id
       and sp.role = v_role
       and sp.person_id is not distinct from v_claim_person_id
     limit 1;
  else
    -- Account arm (unchanged): a signed-in ACCOUNT with no ringside passcode claim
    -- derives its single active ringside show from its OWN entries (entrant-only).
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    v_show_id := public._account_ringside_show_id(p_route);
    if v_show_id is null then
      raise exception 'account is not entered in exactly one active ringside show' using errcode = '42501';
    end if;

    v_role := 'exhibitor';
  end if;

  insert into public.ringside_sessions (
    subscription_id,
    show_id,
    show_passcode_id,
    role,
    favorited_armbands,
    last_seen_at,
    last_seen_route,
    updated_at
  )
  values (
    v_subscription_id,
    v_show_id,
    v_show_passcode_id,
    v_role,
    coalesce(p_favorited_armbands, '{}'::text[]),
    now(),
    p_route,
    now()
  )
  on conflict on constraint ringside_sessions_pkey do update
    set show_passcode_id = excluded.show_passcode_id,
        role = excluded.role,
        favorited_armbands = excluded.favorited_armbands,
        last_seen_at = excluded.last_seen_at,
        last_seen_route = excluded.last_seen_route,
        updated_at = excluded.updated_at;

  show_id := v_show_id;
  role := v_role;
  return next;
end
$$;

revoke all on function public.upsert_ringside_session(text, text, text[], text) from public;
revoke all on function public.upsert_ringside_session(text, text, text[], text) from anon;
grant execute on function public.upsert_ringside_session(text, text, text[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. get_show_access_codes (from 20260830240000): per-judge rows, person_id and judge_display_name.
--    Return columns change, so DROP + CREATE.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_show_access_codes(uuid);

CREATE OR REPLACE FUNCTION public.get_show_access_codes(p_show_id uuid)
RETURNS TABLE(role text, passcode text, recoverable boolean, person_id uuid, judge_display_name text)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_club_id uuid;
  v_allowed_roles text[] := array[]::text[];
  v_is_manager boolean := false;
begin
  if p_show_id is null or auth.uid() is null then
    return;
  end if;

  select s.club_id
    into v_club_id
    from public.shows s
   where s.id = p_show_id
     and s.deleted_at is null;

  if v_club_id is null then
    return;
  end if;

  if public._can_manage_show_passcodes(p_show_id) then
    v_is_manager := true;
    v_allowed_roles := array['admin', 'judge', 'steward', 'exhibitor'];
    -- MYK9-1950: mint any judge code the assignment trigger could not (best-effort, never raises).
    perform public._sync_show_judge_passcodes(p_show_id);
  else
    if exists (
      select 1
        from public.judge_assignments ja
        join public.people p on p.id = ja.person_id
       where ja.show_id = p_show_id
         and p.auth_user_id = auth.uid()
         and p.deleted_at is null
         and ja.status in ('confirmed', 'invited')
    ) then
      v_allowed_roles := array_append(v_allowed_roles, 'judge');
      v_allowed_roles := array_append(v_allowed_roles, 'exhibitor');
    end if;

    -- Stewards keep BOTH scopes: a show-scoped steward row is an operational
    -- ring assignment, not a paperwork label (MYK9-114). Only secretary and
    -- chairman naming moves to show_officials.
    if exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.auth_user_id = auth.uid()
         and r.name = 'steward'
         and ur.is_active = true
         and (ur.expires_at is null or ur.expires_at > now())
         and (
           ur.show_id = p_show_id
           or (ur.show_id is null and ur.club_id = v_club_id)
         )
    ) then
      v_allowed_roles := array_append(v_allowed_roles, 'steward');
      v_allowed_roles := array_append(v_allowed_roles, 'exhibitor');
    end if;

    if exists (
      select 1
        from public.entries e
        left join public.dogs d on d.id = e.dog_id
        join public.people p on p.auth_user_id = auth.uid()
       where e.show_id = p_show_id
         and e.deleted_at is null
         and p.deleted_at is null
         and coalesce(e.check_in_status, '') <> 'pulled'
         and e.entry_status in (
           'no-status', 'draft', 'submitted', 'pending', 'paid', 'confirmed',
           'accepted', 'scheduled', 'pending-payment', 'waitlisted', 'checked-in',
           'at-gate', 'in-ring', 'competing', 'scratch-requested',
           'scratch_requested', 'move-up-requested', 'move_up_requested'
         )
         and (
           e.handler_id = p.id
           or d.owner_id = p.id
           or d.co_owner_id = p.id
         )
    ) then
      v_allowed_roles := array_append(v_allowed_roles, 'exhibitor');
    end if;
  end if;

  if coalesce(array_length(v_allowed_roles, 1), 0) = 0 then
    return;
  end if;

  -- MYK9-1950: a manager reads every judge's code; an assigned judge reads only their own.
  return query
    select
      sp.role,
      case
        when sp.passcode_ciphertext is null then null
        else public._decrypt_show_passcode(sp.passcode_ciphertext)
      end as passcode,
      sp.passcode_ciphertext is not null as recoverable,
      sp.person_id,
      nullif(btrim(concat_ws(' ', jp.first_name, jp.last_name)), '') as judge_display_name
    from public.show_passcodes sp
    left join public.people jp on jp.id = sp.person_id
    where sp.show_id = p_show_id
      and sp.role = any(v_allowed_roles)
      and (
        sp.role <> 'judge'
        or v_is_manager
        or exists (
          select 1
            from public.people me
           where me.id = sp.person_id
             and me.auth_user_id = auth.uid()
             and me.deleted_at is null
        )
      )
    order by case sp.role
      when 'admin' then 1
      when 'judge' then 2
      when 'steward' then 3
      when 'exhibitor' then 4
      else 5
    end, judge_display_name nulls last, sp.person_id;
end
$function$;

REVOKE ALL ON FUNCTION public.get_show_access_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_access_codes(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8b. The per-judge class scope, in one place. ringside_update_entry, ringside_update_class and
--     ringside_complete_stale_class all call these, so the three cannot drift.
-- -----------------------------------------------------------------------------

-- TRUE when the person is a live (not soft-deleted) judge with a confirmed/invited assignment to
-- the class RIGHT NOW. Checked at write time, so a mid-show judge change needs no new code.
CREATE OR REPLACE FUNCTION public._ringside_judge_in_scope(p_class_id uuid, p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.judge_assignments ja
      JOIN public.people pe ON pe.id = ja.person_id
     WHERE ja.person_id = p_person_id
       AND ja.class_id = p_class_id
       AND ja.status IN ('confirmed', 'invited')
       AND pe.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public._ringside_judge_in_scope(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The distinct refusal: RS403 naming the class's judge (DETAIL = that judge's person id), or
-- 'This class has no judge assigned'. Always raises.
CREATE OR REPLACE FUNCTION public._ringside_raise_class_out_of_scope(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_judge_person_id uuid;
  v_judge_display_name text;
BEGIN
  SELECT ja.person_id,
         nullif(btrim(concat_ws(' ', pe.first_name, pe.last_name)), '')
    INTO v_judge_person_id, v_judge_display_name
    FROM public.judge_assignments ja
    JOIN public.people pe ON pe.id = ja.person_id
   WHERE ja.class_id = p_class_id
     AND ja.status IN ('confirmed', 'invited')
     AND pe.deleted_at IS NULL
   ORDER BY (ja.status = 'confirmed') DESC, ja.id
   LIMIT 1;

  IF v_judge_person_id IS NULL THEN
    RAISE EXCEPTION 'This class has no judge assigned'
      USING errcode = 'RS403';
  END IF;
  RAISE EXCEPTION 'This class is judged by %', coalesce(v_judge_display_name, 'another judge')
    USING errcode = 'RS403', detail = v_judge_person_id::text;
END
$$;

REVOKE ALL ON FUNCTION public._ringside_raise_class_out_of_scope(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. ringside_update_entry (from 20261108031700): the per-judge scope gate and audit columns.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ringside_update_entry(
  p_entry_id uuid,
  p_fields jsonb,
  p_expected_version integer,
  p_client_saved_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_caller_name text;
  v_actor_tier text;
  v_claim_generation text;
  v_passcode_id uuid;
  v_prior_row jsonb;
  v_new_row jsonb;
  v_changes jsonb;
  v_show_id uuid;
  v_class_id uuid;
  v_club_id uuid;
  v_current_version integer;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_is_steward boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_claim_person_id uuid;
  v_judge_claim_out_of_scope boolean := false;
  v_has_judge_claim boolean;
  v_has_steward_claim boolean;
  v_allowed text[];
  v_allowed_fields jsonb;
  v_set_clause text;
  v_updated_id uuid;
  v_new_version integer;
  v_replay_version integer;
  v_containment public.ringside_containment;
  v_runorder_checkin_cols constant text[] := ARRAY[
    'run_order', 'check_in_status', 'is_in_ring',
    'ring_entry_time', 'ring_exit_time'
  ];
  v_scoring_cols constant text[] := ARRAY[
    'is_scored', 'result_status',
    'search_time_seconds',
    'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds',
    'total_correct_finds', 'total_incorrect_finds', 'total_faults', 'no_finish_count',
    'area1_correct', 'area1_incorrect', 'area1_faults',
    'area2_correct', 'area2_incorrect', 'area2_faults',
    'area3_correct', 'area3_incorrect', 'area3_faults',
    'total_score', 'points_earned', 'points_possible',
    'bonus_points', 'penalty_points',
    'time_over_limit', 'time_limit_exceeded_seconds',
    'final_placement',
    'judge_notes', 'judge_signature', 'judge_signature_timestamp',
    'disqualification_reason', 'has_video_review', 'video_review_notes',
    'scoring_started_at', 'scoring_completed_at'
  ];
BEGIN
  -- 1. Load the entry's context. Existence is still disclosed for a known UUID,
  -- matching the prior accepted trade-off; version conflicts are not.
  SELECT e.show_id, e.class_id, e.version
    INTO v_show_id, v_class_id, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;

  IF v_show_id IS NULL OR v_club_id IS NULL THEN
    RAISE EXCEPTION 'Entry % has no show/club context', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 2. Resolve the caller to a person record (NULL for a passcode/anon session).
  SELECT p.id, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_caller_person_id, v_caller_name
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Authorization tiers.
  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = v_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_is_steward := EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.auth_user_id = (SELECT auth.uid())
       AND r.name = 'steward'
       AND ur.is_active
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
       AND (ur.show_id = v_show_id
            OR (ur.show_id IS NULL AND ur.club_id = v_club_id))
  );

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_claim_person_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_person_id'), '')::uuid;
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');
  v_has_steward_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role = 'steward';

  IF (v_has_judge_claim OR v_has_steward_claim)
     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  -- MYK9-1950: a per-judge passcode scores only the classes assigned to that judge, checked LIVE
  -- against judge_assignments at write time, so a mid-show judge change needs no new code. The
  -- admin code keeps scoring any class. A judge claim with no person id is the old show-wide
  -- shape: the generation check above already refused it as revoked.
  IF v_has_judge_claim AND v_claim_role = 'judge'
     AND NOT public._ringside_judge_in_scope(v_class_id, v_claim_person_id) THEN
    v_has_judge_claim := false;
    v_judge_claim_out_of_scope := true;
  END IF;

  -- The refusal is distinct (RS403) and names the class's judge so the device can say who to see.
  -- A caller who is also a manager, assigned judge or steward never reaches it.
  IF v_judge_claim_out_of_scope
     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward) THEN
    PERFORM public._ringside_raise_class_out_of_scope(v_class_id);
  END IF;

  -- 4. Resolve the writable column allow-list before any OCC conflict response.
  -- This is the security boundary: unauthorized callers must never increment the
  -- health counter or receive current-version DETAIL.
  IF v_is_manager OR v_is_assigned_judge OR v_has_judge_claim THEN
    v_allowed := v_runorder_checkin_cols || v_scoring_cols;
    -- MYK9-1754: name the arm that authorized the write, in the same order.
    v_actor_tier := CASE
      WHEN v_is_manager THEN 'manager'
      WHEN v_is_assigned_judge THEN 'assigned_judge'
      WHEN v_claim_role = 'admin' THEN 'passcode_admin'
      ELSE 'passcode_judge'
    END;
  ELSIF v_is_steward OR v_has_steward_claim THEN
    v_allowed := v_runorder_checkin_cols;
    v_actor_tier := CASE WHEN v_is_steward THEN 'steward' ELSE 'passcode_steward' END;
  ELSE
    RAISE EXCEPTION 'Not authorized to update entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 5. Filter the payload down to the allowed keys present. Pure: reads no row.
  SELECT jsonb_object_agg(je.key, je.value)
    INTO v_allowed_fields
    FROM jsonb_each(p_fields) AS je
   WHERE je.key = ANY(v_allowed);

  -- 6. Authorized OCC precheck. A stale expected_version can never succeed by
  -- retrying unchanged, so reject it before the dynamic UPDATE.
  -- nextval survives the abort and now counts only authorized ringside writers.
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    -- MYK9-740: a replay of a write that already landed (its response was
    -- lost) is not a conflict. Same predicate as the late site below.
    v_replay_version := public.ringside_replay_applied_version(p_entry_id, v_allowed_fields);
    IF v_replay_version IS NOT NULL THEN
      RETURN v_replay_version;
    END IF;

    PERFORM nextval('public.ringside_conflict_seq');
    -- MYK9-115 admission control: while the breaker is contained, conflicting
    -- calls back off server-side (rate-caps stale bundles that predate RS429)
    -- and raise a distinguishable code so current clients pause their outbox.
    -- Version-correct calls never take this path (blast-radius decision).
    SELECT * INTO v_containment FROM public.ringside_containment;
    IF FOUND AND v_containment.state = 'contained' THEN
      PERFORM pg_sleep(v_containment.backpressure_ms / 1000.0);
      RAISE EXCEPTION 'Ringside scoring contained; retries paused'
        USING errcode = 'RS429',
              detail = v_current_version::text,
              hint = 'retry_after=60';
    END IF;
    RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  IF v_allowed_fields IS NULL THEN
    RETURN v_current_version;
  END IF;

  -- 7. Build the SET clause from the filtered keys (identifiers from the fixed
  -- allow-list, %I-quoted -> injection-safe).
  SELECT string_agg(format('%I = ($3::public.entries).%I', key, key), ', ')
    INTO v_set_clause
    FROM jsonb_object_keys(v_allowed_fields) AS key;

  -- MYK9-1754: capture the pre-update image for the audit diff. No path that can
  -- reach a containment pg_sleep may hold the row lock (Codex P1 on PR #2436).
  --
  -- Versioned call (the normal path): read WITHOUT a lock. The trigger
  -- entries_version_increment (20260608200000_replication_version_column.sql,
  -- BEFORE UPDATE: NEW.version = OLD.version + 1) bumps version on every UPDATE,
  -- so an UPDATE that matched `version = p_expected_version` modified exactly the
  -- row version p_expected_version. If the image read here carries that version,
  -- it IS the row the UPDATE changed; if not, the UPDATE cannot succeed (it takes
  -- the conflict path, and no audit row is written). The guard after the UPDATE
  -- nulls the image in that impossible case so `old` reads null, never wrong.
  --
  -- Unversioned call (p_expected_version IS NULL): last-write-wins, so a lock-free
  -- read could be stale if another writer commits while the UPDATE waits under
  -- READ COMMITTED. Lock for the read. This path cannot sleep: with no version
  -- predicate the UPDATE misses only when the row is gone, and the late branch
  -- below then finds no row and raises P0002; its pg_sleep sits behind FOUND.
  IF p_expected_version IS NULL THEN
    SELECT to_jsonb(o) INTO v_prior_row
      FROM public.entries o
     WHERE o.id = p_entry_id
       FOR UPDATE;
  ELSE
    SELECT to_jsonb(o) INTO v_prior_row
      FROM public.entries o
     WHERE o.id = p_entry_id;
  END IF;

  -- MYK9-1759: tell the entries audit trigger this row's UPDATE is audited below
  -- (step 10). The value is the entry id, transaction-local, and the trigger only
  -- honors it for this row at trigger depth 1, so placement recalculations the
  -- UPDATE fans out to other rows are still audited by the trigger.
  PERFORM set_config('myk9.score_audit_by_rpc', p_entry_id::text, true);

  -- 8. Apply the update with opt-in optimistic concurrency.
  EXECUTE format(
    'UPDATE public.entries SET %s WHERE id = $1 AND ($2 IS NULL OR version = $2) RETURNING id',
    v_set_clause
  )
  USING p_entry_id, p_expected_version, jsonb_populate_record(NULL::public.entries, v_allowed_fields)
  INTO v_updated_id;

  -- MYK9-1759: close the window straight away, so a later UPDATE in this
  -- transaction (any entry, this one included) is audited by the trigger.
  PERFORM set_config('myk9.score_audit_by_rpc', '', true);

  IF v_updated_id IS NULL THEN
    -- MYK9-740: an identical call that committed while this one waited on the
    -- row lock leaves nothing to conflict with. Same predicate as step 6.
    v_replay_version := public.ringside_replay_applied_version(p_entry_id, v_allowed_fields);
    IF v_replay_version IS NOT NULL THEN
      RETURN v_replay_version;
    END IF;

    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      PERFORM nextval('public.ringside_conflict_seq');
      -- Same containment gate at the late TOCTOU conflict site (mirrors step 6).
      SELECT * INTO v_containment FROM public.ringside_containment;
      IF FOUND AND v_containment.state = 'contained' THEN
        PERFORM pg_sleep(v_containment.backpressure_ms / 1000.0);
        RAISE EXCEPTION 'Ringside scoring contained; retries paused'
          USING errcode = 'RS429',
                detail = v_current_version::text,
                hint = 'retry_after=60';
      END IF;
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    ELSE
      RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
    END IF;
  END IF;

  -- 9. Return the authoritative post-trigger version.
  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;

  -- Defensive (see the pre-image comment before step 8): never record an image
  -- that is not the version the UPDATE matched.
  IF p_expected_version IS NOT NULL
     AND (v_prior_row ->> 'version')::integer IS DISTINCT FROM p_expected_version THEN
    v_prior_row := NULL;
  END IF;

  -- 10. MYK9-1754: audit this write, in the same transaction, only now that the
  -- UPDATE really ran. Every early RETURN above (idempotent replay, nothing
  -- writable in the payload) and every RAISE wrote nothing, so they audit nothing.
  -- Both sides pass through the entries row type so timestamps compare by value.
  v_new_row := to_jsonb(jsonb_populate_record(NULL::public.entries, v_allowed_fields));

  SELECT coalesce(
           jsonb_object_agg(k, jsonb_build_object('old', v_prior_row -> k, 'new', v_new_row -> k)),
           '{}'::jsonb
         )
    INTO v_changes
    FROM jsonb_object_keys(v_allowed_fields) AS k
   WHERE (v_prior_row -> k) IS DISTINCT FROM (v_new_row -> k);

  IF v_actor_tier LIKE 'passcode_%' THEN
    v_claim_generation := (SELECT auth.jwt()) -> 'app_metadata' ->> 'passcode_generation';
    -- MYK9-1950: name the code (and the judge it belongs to) that authorized the write.
    SELECT sp.id INTO v_passcode_id
      FROM public.show_passcodes sp
     WHERE sp.show_id = v_show_id
       AND sp.role = v_claim_role
       AND sp.person_id IS NOT DISTINCT FROM v_claim_person_id
     LIMIT 1;
  END IF;

  INSERT INTO public.entry_score_audit (
    entry_id, class_id, show_id, changes,
    actor_user_id, actor_person_id, actor_display_name, actor_tier,
    passcode_role, passcode_generation, passcode_id, passcode_person_id,
    entry_version, client_saved_at
  ) VALUES (
    p_entry_id, v_class_id, v_show_id, v_changes,
    (SELECT auth.uid()),
    v_caller_person_id,
    v_caller_name,
    v_actor_tier,
    CASE WHEN v_actor_tier LIKE 'passcode_%' THEN v_claim_role END,
    v_claim_generation,
    v_passcode_id,
    CASE WHEN v_actor_tier LIKE 'passcode_%' THEN v_claim_person_id END,
    v_new_version,
    p_client_saved_at
  );

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. ringside_update_class and ringside_complete_stale_class: the same per-judge scope.
--     ringside_update_class is copied from 20261101203100 (MYK9-1625), ringside_complete_stale_class
--     from 20261031051700 (MYK9-1514), the latest definitions. The only change in each is the
--     scope check after the generation check; the admin code stays show-wide. Grants, SECURITY
--     DEFINER and search_path are unchanged.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ringside_update_class(
  p_class_id uuid,
  p_fields jsonb,
  p_expected_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_registry text;
  v_element text;
  v_level text;
  v_current_version integer;
  v_caller_person_id uuid;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_claim_person_id uuid;
  v_has_judge_claim boolean;
  v_bad_key text;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_time_keys constant text[] := ARRAY[
    'time_limit_seconds', 'time_limit_area2_seconds', 'time_limit_area3_seconds'];
  v_has_area boolean[] := ARRAY[false, false, false];
  v_area_secs integer[] := ARRAY[NULL, NULL, NULL]::integer[];
  v_cur_area_secs integer[];
  v_key text;
  v_i integer;
  v_has_time boolean;
  v_has_status boolean;
  v_has_start boolean;
  v_has_phase boolean;
  v_has_phase_time boolean;
  v_has_expected boolean;
  v_has_areas boolean;
  v_status text;
  v_start time;
  v_phase text;
  v_phase_time time;
  v_expected timestamptz;
  v_areas integer;
  v_cur_status text;
  v_cur_start time;
  v_cur_phase text;
  v_cur_phase_time time;
  v_cur_expected timestamptz;
  v_cur_areas integer;
  v_fixed integer;
  v_min integer;
  v_max integer;
  v_low integer;
  v_high integer;
  v_new_version integer;
BEGIN
  -- 1. Class context.
  SELECT tr.show_id, tr.registry_id, c.element, c.level, c.version
    INTO v_show_id, v_registry, v_element, v_level, v_current_version
    FROM public.classes c
    JOIN public.trials tr ON tr.id = c.trial_id
   WHERE c.id = p_class_id
     AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class % not found', p_class_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Class % has no show/club context', p_class_id USING errcode = '42501';
  END IF;

  -- 2. Caller identity (NULL person for a passcode/anon session).
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Authorization tiers (mirrors ringside_update_entry; no steward tier).
  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = p_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_claim_person_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_person_id'), '')::uuid;
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');

  IF v_has_judge_claim
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  IF v_has_judge_claim AND v_claim_role = 'judge'
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND NOT public._ringside_judge_in_scope(p_class_id, v_claim_person_id) THEN
    PERFORM public._ringside_raise_class_out_of_scope(p_class_id);
  END IF;

  IF NOT (v_is_manager OR v_is_assigned_judge OR v_has_judge_claim) THEN
    RAISE EXCEPTION 'Not authorized to update class %', p_class_id USING errcode = '42501';
  END IF;

  -- 4. Allow-list: refuse anything else.
  SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_fields) AS k
   WHERE k NOT IN ('status', 'start_time', 'time_limit_seconds',
                   'time_limit_area2_seconds', 'time_limit_area3_seconds',
                   'ring_phase', 'ring_phase_time', 'revised_expected_start',
                   'num_areas')
   LIMIT 1;
  IF v_bad_key IS NOT NULL THEN
    RAISE EXCEPTION 'Field % cannot be set from ringside', v_bad_key USING errcode = '42501';
  END IF;
  FOR v_i IN 1..3 LOOP
    v_has_area[v_i] := v_fields ? v_time_keys[v_i];
  END LOOP;
  v_has_time := v_has_area[1] OR v_has_area[2] OR v_has_area[3];
  v_has_status := v_fields ? 'status';
  v_has_start := v_fields ? 'start_time';
  v_has_phase := v_fields ? 'ring_phase';
  v_has_phase_time := v_fields ? 'ring_phase_time';
  v_has_expected := v_fields ? 'revised_expected_start';
  v_has_areas := v_fields ? 'num_areas';
  IF NOT (v_has_time OR v_has_status OR v_has_start
          OR v_has_phase OR v_has_phase_time OR v_has_expected OR v_has_areas) THEN
    RAISE EXCEPTION 'Nothing to update' USING errcode = '22023';
  END IF;

  -- 5a. Status: only the values ringside sends.
  IF v_has_status THEN
    v_status := v_fields ->> 'status';
    IF v_status IS NULL OR v_status NOT IN ('upcoming', 'setup', 'in_progress', 'completed') THEN
      RAISE EXCEPTION 'Status % cannot be set from ringside', v_status USING errcode = '22023';
    END IF;
  END IF;

  -- 5b. Start time: HH:MM[:SS] or null.
  IF v_has_start THEN
    BEGIN
      v_start := (v_fields ->> 'start_time')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'start_time must be a time of day' USING errcode = '22023';
    END;
  END IF;

  -- 5b2. Ring phase (MYK9-1513): null, or one of the three phases. The time is the
  -- briefing time or the "Break until" time, a time of day or null. A phase on a class
  -- that is not in progress is cleared by trg_classes_clear_ring_phase, not refused, so
  -- a queued write that replays after the server completed the class does not dead-letter.
  IF v_has_phase THEN
    IF jsonb_typeof(v_fields -> 'ring_phase') = 'null' THEN
      v_phase := NULL;
    ELSIF jsonb_typeof(v_fields -> 'ring_phase') = 'string'
          AND (v_fields ->> 'ring_phase') IN ('briefing', 'break', 'offline_scoring') THEN
      v_phase := v_fields ->> 'ring_phase';
    ELSE
      RAISE EXCEPTION 'ring_phase must be briefing, break, offline_scoring or null'
        USING errcode = '22023';
    END IF;
  END IF;

  IF v_has_phase_time THEN
    BEGIN
      v_phase_time := (v_fields ->> 'ring_phase_time')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'ring_phase_time must be a time of day' USING errcode = '22023';
    END;
  END IF;

  -- 5b3. Expected start: the secretary's revised day-of expectation, an instant or null.
  IF v_has_expected THEN
    BEGIN
      v_expected := (v_fields ->> 'revised_expected_start')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'revised_expected_start must be a timestamp' USING errcode = '22023';
    END;
  END IF;

  -- 5b4. Area count (MYK9-1625): the judge's choice of search areas, a whole number
  -- from 1 to 3 (the scoresheet carries at most three area times). Never cleared from
  -- ringside: an unset count is what makes the picker ask.
  IF v_has_areas THEN
    -- CASE, not OR: SQL does not promise to skip the cast for a non-number. The
    -- parentheses keep the CASE's own THEN from ending the IF condition.
    IF NOT (CASE WHEN jsonb_typeof(v_fields -> 'num_areas') = 'number'
                 THEN (v_fields ->> 'num_areas')::numeric IN (1, 2, 3)
                 ELSE false END) THEN
      RAISE EXCEPTION 'num_areas must be 1, 2 or 3' USING errcode = '22023';
    END IF;
    v_areas := (v_fields ->> 'num_areas')::numeric::integer;
  END IF;

  -- 5c. Max times, one per area, and the rule range. NULL clears an area's limit.
  FOR v_i IN 1..3 LOOP
    CONTINUE WHEN NOT v_has_area[v_i];
    v_key := v_time_keys[v_i];
    IF jsonb_typeof(v_fields -> v_key) = 'null' THEN
      v_area_secs[v_i] := NULL;
    ELSIF jsonb_typeof(v_fields -> v_key) = 'number' THEN
      -- Every caller, managers included: a real time, never 0 / negative / overflow.
      IF (v_fields ->> v_key)::numeric < 1 OR (v_fields ->> v_key)::numeric > 86400 THEN
        RAISE EXCEPTION 'Max time must be between 1 second and 24 hours' USING errcode = '22023';
      END IF;
      v_area_secs[v_i] := (v_fields ->> v_key)::numeric::integer;
    ELSE
      RAISE EXCEPTION '% must be a number or null', v_key USING errcode = '22023';
    END IF;
  END LOOP;

  -- The range binds judges and judge passcodes, per area. A manager is the
  -- authority on the class and is never range-checked on the direct path either,
  -- so a secretary's edit that happens to route here must not be refused at sync.
  IF v_has_time AND NOT v_is_manager THEN
    SELECT max(r.max_time_seconds_fixed), min(r.max_time_seconds_min), max(r.max_time_seconds_max)
      INTO v_fixed, v_min, v_max
      FROM public.sport_class_rules r
      JOIN public.sport_templates st ON st.id = r.sport_template_id
     WHERE st.organization = v_registry
       AND r.element = v_element
       AND r.level IS NOT DISTINCT FROM v_level;

    IF v_fixed IS NOT NULL THEN
      v_low := 1; v_high := v_fixed;
    ELSIF v_min IS NOT NULL AND v_max IS NOT NULL THEN
      v_low := v_min; v_high := v_max;
    ELSE
      v_low := 1; v_high := 900;
    END IF;

    FOR v_i IN 1..3 LOOP
      IF v_has_area[v_i] AND v_area_secs[v_i] IS NOT NULL
         AND (v_area_secs[v_i] < v_low OR v_area_secs[v_i] > v_high) THEN
        RAISE EXCEPTION 'Max time % s is outside the rule range %-% s', v_area_secs[v_i], v_low, v_high
          USING errcode = '22023';
      END IF;
    END LOOP;
  END IF;

  -- 6. OCC (nullable) and write. A replay whose write already landed (the
  -- response was lost and the offline queue resends it with the old version) is
  -- success, not a conflict: same rule as ringside_update_entry (MYK9-740).
  -- Lock the row and read its version WITH the values compared below, so the replay
  -- check, the version it returns and the write all see one consistent row. No
  -- back-off sleep follows (unlike the entry RPC's containment gate), so the lock
  -- is held only for this call.
  SELECT c.version,
         ARRAY[c.time_limit_seconds, c.time_limit_area2_seconds, c.time_limit_area3_seconds],
         c.status, c.start_time, c.ring_phase, c.ring_phase_time, c.revised_expected_start,
         c.num_areas
    INTO v_current_version, v_cur_area_secs, v_cur_status, v_cur_start,
         v_cur_phase, v_cur_phase_time, v_cur_expected, v_cur_areas
    FROM public.classes c WHERE c.id = p_class_id
     FOR UPDATE;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version
     AND (NOT v_has_area[1] OR v_cur_area_secs[1] IS NOT DISTINCT FROM v_area_secs[1])
     AND (NOT v_has_area[2] OR v_cur_area_secs[2] IS NOT DISTINCT FROM v_area_secs[2])
     AND (NOT v_has_area[3] OR v_cur_area_secs[3] IS NOT DISTINCT FROM v_area_secs[3])
     AND (NOT v_has_status OR v_cur_status IS NOT DISTINCT FROM v_status)
     AND (NOT v_has_start OR v_cur_start IS NOT DISTINCT FROM v_start)
     AND (NOT v_has_phase OR v_cur_phase IS NOT DISTINCT FROM v_phase)
     AND (NOT v_has_phase_time OR v_cur_phase_time IS NOT DISTINCT FROM v_phase_time)
     AND (NOT v_has_expected OR v_cur_expected IS NOT DISTINCT FROM v_expected)
     AND (NOT v_has_areas OR v_cur_areas IS NOT DISTINCT FROM v_areas) THEN
    RETURN v_current_version;
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  UPDATE public.classes
     SET time_limit_seconds = CASE WHEN v_has_area[1] THEN v_area_secs[1] ELSE time_limit_seconds END,
         time_limit_area2_seconds =
           CASE WHEN v_has_area[2] THEN v_area_secs[2] ELSE time_limit_area2_seconds END,
         time_limit_area3_seconds =
           CASE WHEN v_has_area[3] THEN v_area_secs[3] ELSE time_limit_area3_seconds END,
         status = CASE WHEN v_has_status THEN v_status ELSE status END,
         start_time = CASE WHEN v_has_start THEN v_start ELSE start_time END,
         ring_phase = CASE WHEN v_has_phase THEN v_phase ELSE ring_phase END,
         -- The time belongs to briefing / break only: any other effective phase clears it
         -- rather than failing the CHECK.
         ring_phase_time = CASE
           WHEN COALESCE(CASE WHEN v_has_phase THEN v_phase ELSE ring_phase END, '')
                NOT IN ('briefing', 'break') THEN NULL
           WHEN v_has_phase_time THEN v_phase_time
           ELSE ring_phase_time
         END,
         revised_expected_start =
           CASE WHEN v_has_expected THEN v_expected ELSE revised_expected_start END,
         num_areas = CASE WHEN v_has_areas THEN v_areas ELSE num_areas END
   WHERE id = p_class_id
     AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING version INTO v_new_version;

  IF NOT FOUND THEN
    -- Lost a race between the check above and the write. If an identical call
    -- landed in between, this replay already applied: success. Otherwise report
    -- the fresh version in DETAIL so the client rebases its OCC token.
    SELECT c.version,
           ARRAY[c.time_limit_seconds, c.time_limit_area2_seconds, c.time_limit_area3_seconds],
           c.status, c.start_time, c.ring_phase, c.ring_phase_time, c.revised_expected_start,
           c.num_areas
      INTO v_current_version, v_cur_area_secs, v_cur_status, v_cur_start,
           v_cur_phase, v_cur_phase_time, v_cur_expected, v_cur_areas
      FROM public.classes c WHERE c.id = p_class_id;
    IF (NOT v_has_area[1] OR v_cur_area_secs[1] IS NOT DISTINCT FROM v_area_secs[1])
       AND (NOT v_has_area[2] OR v_cur_area_secs[2] IS NOT DISTINCT FROM v_area_secs[2])
       AND (NOT v_has_area[3] OR v_cur_area_secs[3] IS NOT DISTINCT FROM v_area_secs[3])
       AND (NOT v_has_status OR v_cur_status IS NOT DISTINCT FROM v_status)
       AND (NOT v_has_start OR v_cur_start IS NOT DISTINCT FROM v_start)
       AND (NOT v_has_phase OR v_cur_phase IS NOT DISTINCT FROM v_phase)
       AND (NOT v_has_phase_time OR v_cur_phase_time IS NOT DISTINCT FROM v_phase_time)
       AND (NOT v_has_expected OR v_cur_expected IS NOT DISTINCT FROM v_expected)
       AND (NOT v_has_areas OR v_cur_areas IS NOT DISTINCT FROM v_areas) THEN
      RETURN v_current_version;
    END IF;
    RAISE EXCEPTION 'Version conflict updating class % (expected %)', p_class_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_class(uuid, jsonb, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ringside_complete_stale_class(
  p_class_id uuid,
  p_expected_entry_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_caller_person_id uuid;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_claim_person_id uuid;
  v_has_judge_claim boolean;
  v_status_source text;
  v_class_status text;
  v_current uuid[];
  v_expected uuid[];
  v_any_in_ring boolean;
BEGIN
  -- 1. Class context (unlocked: the class row is locked after the entry rows).
  SELECT tr.show_id
    INTO v_show_id
    FROM public.classes c
    JOIN public.trials tr ON tr.id = c.trial_id
   WHERE c.id = p_class_id
     AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class % not found', p_class_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Class % has no show/club context', p_class_id USING errcode = '42501';
  END IF;

  -- 2. Caller identity (NULL person for a passcode/anon session).
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Authorization tiers, as ringside_update_entry (no steward tier).
  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = p_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_claim_person_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_person_id'), '')::uuid;
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');

  IF v_has_judge_claim
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  IF v_has_judge_claim AND v_claim_role = 'judge'
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND NOT public._ringside_judge_in_scope(p_class_id, v_claim_person_id) THEN
    PERFORM public._ringside_raise_class_out_of_scope(p_class_id);
  END IF;

  IF NOT (v_is_manager OR v_is_assigned_judge OR v_has_judge_claim) THEN
    RAISE EXCEPTION 'Not authorized to complete class %', p_class_id
      USING errcode = '42501';
  END IF;

  -- 4. Lock, in the scoring path's order: the class's unscored entry rows first, so
  -- a score landing now waits and is not overwritten, then the class row.
  PERFORM e.id
     FROM public.entries e
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
      AND coalesce(e.entry_status, '') NOT IN
          ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
      AND e.check_in_status IS DISTINCT FROM 'pulled'
      AND e.is_scored IS NOT TRUE
      AND coalesce(e.result_status, '') NOT IN ('absent', 'excused', 'disqualified')
      FOR UPDATE OF e;

  SELECT c.status_source, c.status
    INTO v_status_source, v_class_status
    FROM public.classes c
   WHERE c.id = p_class_id
     FOR UPDATE OF c;

  -- 4b. Only now read the set to compare. The read above locked the rows that existed
  -- then; a day-of entry an official added between that read and the class lock is
  -- not among them, so the set is re-read (a new statement sees it) and compared
  -- against what the judge was shown. Same predicate as the lock above.
  SELECT coalesce(array_agg(s.id ORDER BY s.id), '{}'::uuid[]),
         coalesce(bool_or(s.in_ring), false)
    INTO v_current, v_any_in_ring
    FROM (
      SELECT e.id,
             (e.is_in_ring IS TRUE OR e.check_in_status = 'in-ring') AS in_ring
        FROM public.entries e
       WHERE e.class_id = p_class_id
         AND e.deleted_at IS NULL
         AND coalesce(e.entry_status, '') NOT IN
             ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
         AND e.check_in_status IS DISTINCT FROM 'pulled'
         AND e.is_scored IS NOT TRUE
         AND coalesce(e.result_status, '') NOT IN ('absent', 'excused', 'disqualified')
    ) s;

  -- A class a secretary cancelled or reset, or one with a dog in the ring, is
  -- not stale: refuse with no dogs to offer.
  IF v_class_status IS DISTINCT FROM 'in_progress' OR v_any_in_ring THEN
    RETURN jsonb_build_object('ok', false, 'current_entry_ids', '[]'::jsonb,
      'reason', CASE WHEN v_class_status IS DISTINCT FROM 'in_progress'
                     THEN 'not_in_progress' ELSE 'in_ring' END);
  END IF;

  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO v_expected
    FROM unnest(coalesce(p_expected_entry_ids, '{}'::uuid[])) AS x;

  IF cardinality(v_expected) = 0 OR v_expected IS DISTINCT FROM v_current THEN
    RETURN jsonb_build_object('ok', false, 'current_entry_ids', to_jsonb(v_current),
      'reason', 'changed');
  END IF;

  -- 5. Mark exactly those entries absent: what the Absent chip writes (zero time,
  -- zero counts, "Absent" reason, scoring_started_at untouched).
  UPDATE public.entries e
     SET result_status = 'absent',
         is_scored = true,
         search_time_seconds = 0,
         area1_time_seconds = NULL,
         area2_time_seconds = NULL,
         area3_time_seconds = NULL,
         area4_time_seconds = NULL,
         total_correct_finds = 0,
         total_incorrect_finds = 0,
         total_faults = 0,
         no_finish_count = 0,
         points_earned = 0,
         disqualification_reason = 'Absent',
         scoring_completed_at = now()
   WHERE e.id = ANY (v_current);

  -- 6. A hand-set status is never derived; complete it here, in the same
  -- transaction. A derived class completes through the entries trigger above.
  IF v_status_source = 'manual' THEN
    UPDATE public.classes SET status = 'completed' WHERE id = p_class_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'marked_count', cardinality(v_current));
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_complete_stale_class(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ringside_complete_stale_class(uuid, uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11. Backfill: every judge already assigned gets a code (the show-wide code is gone).
-- -----------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_pair record;
BEGIN
  FOR v_pair IN
    SELECT DISTINCT ja.show_id, ja.person_id
      FROM public.judge_assignments ja
     WHERE ja.show_id IS NOT NULL
       AND ja.class_id IS NOT NULL
       AND ja.status IN ('confirmed', 'invited')
     ORDER BY ja.show_id, ja.person_id
  LOOP
    -- Best-effort: a database without the Vault pepper must not abort the push. Missing codes are
    -- minted on demand by get_show_access_codes / regenerate_show_passcodes.
    PERFORM public._try_sync_judge_passcode(v_pair.show_id, v_pair.person_id);
  END LOOP;
END
$backfill$;

COMMIT;

NOTIFY pgrst, 'reload schema';
