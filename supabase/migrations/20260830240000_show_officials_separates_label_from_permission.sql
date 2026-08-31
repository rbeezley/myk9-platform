-- Phase 2 of docs/plan-secretary-permission-model.md — the label stops being the grant.
--
-- Phase 1 made a club appointment the way to get show access. It left one exception
-- standing: a show-scoped `user_roles` row ALSO grants access, all on its own. So the
-- rule "appointment is the only thing that grants access" was true of the club path and
-- false of the show path, which is the ambiguity this plan exists to remove.
--
-- The reason those rows could not simply be dropped is that they are doing a second,
-- legitimate job: `shows` has no `secretary_id` column, so a show-scoped user_roles row
-- is ALSO the record of who is named on the paperwork. get_show_officials reads it, and
-- useEntryFormData fills the AKC/UKC PDF forms from that. Delete the rows and the Trial
-- Secretary disappears off the printed entry form.
--
-- So the naming gets its own home, and the permission stops travelling with it.
--
-- MOVING THE LABEL IS NOT ENOUGH, and an earlier draft of this migration claimed it was.
-- Emptying the show-scoped rows does not make the read helpers' `ur.show_id` arms dead
-- code, because `approve_role_request` (site-admin) can mint a fresh show-scoped
-- `secretary` row at any time — so the exception would survive with nothing in it,
-- waiting. Steps 8-14 therefore remove the arms as well, and step 15 stops the one path
-- that could create such a row from doing so silently.
--
-- These sit on show-day paths (ringside access codes, class hide counts, the results
-- authorization context), so each edit is the smallest possible: the club-scoped
-- disjunct in every one of them already exists and already carries the case, and only
-- the `show_id` disjunct is removed. Live data: 2 active show-scoped rows (1 secretary,
-- 1 chairman), both of whom hold a club appointment, and 0 show-scoped stewards.
--
-- DIVERGENCE FROM THE PLAN, deliberately. The plan says to CREATE a club appointment for
-- anyone holding only a show-scoped secretary row. That is a silent widening — it hands
-- club-wide access to someone who had exactly one show. Measured against live data no
-- such person exists, so the step is a no-op either way; this asserts and FAILS instead,
-- so that if it ever stops being a no-op a human decides rather than a migration.

BEGIN;

-- 1. The naming record.
CREATE TABLE IF NOT EXISTS public.show_officials (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('secretary', 'chairman', 'steward')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  UNIQUE (show_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_show_officials_show_id ON public.show_officials (show_id);

COMMENT ON TABLE public.show_officials IS
  'Who is NAMED on a show''s paperwork. Carries no permissions whatsoever — show access comes from a club-scoped secretary appointment (see grant_club_secretary). Read by get_show_officials for the premium list and the AKC/UKC entry forms.';

-- Grants are explicit because omitting them does NOT keep anon out: ALTER DEFAULT
-- PRIVILEGES in this database grants anon full CRUD on every newly created public table.
-- anon gets nothing: both RPCs over this data are authenticated-only, and the public
-- landing pages do not render officials today.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_officials TO authenticated;
GRANT ALL ON public.show_officials TO service_role;
REVOKE ALL ON public.show_officials FROM anon;

ALTER TABLE public.show_officials ENABLE ROW LEVEL SECURITY;
-- FORCE so the policies bind the table owner too; forceRlsInvariant requires it of
-- every repository-owned RLS-enabled public table.
ALTER TABLE public.show_officials FORCE ROW LEVEL SECURITY;

-- Reads reach this table through get_show_officials, which is SECURITY DEFINER and does
-- its own show-visibility check. These policies are the direct-access backstop.
DROP POLICY IF EXISTS show_officials_select ON public.show_officials;
CREATE POLICY show_officials_select ON public.show_officials
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(show_id))
  );

-- Writes go through grant_show_official / revoke_show_official, which authorize the
-- caller themselves. Direct writes stay site-admin-only, matching user_roles.
DROP POLICY IF EXISTS show_officials_write ON public.show_officials;
CREATE POLICY show_officials_write ON public.show_officials
  FOR ALL TO authenticated
  USING ((SELECT public.is_site_admin()))
  WITH CHECK ((SELECT public.is_site_admin()));

-- 2. Nobody may lose access. See the divergence note above: this asserts rather than
--    widening, and is a no-op on today's data (measured: 0 rows).
DO $$
DECLARE
  v_orphans integer;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.shows s ON s.id = ur.show_id
  -- Chairman is included because step 4 retires chairman show-scoped rows too;
  -- a chairman with no club appointment would otherwise lose access silently.
  -- Steward is excluded because its show-scoped row is not being retired.
  WHERE r.name IN ('secretary', 'trial_secretary', 'chairman')
    AND ur.show_id IS NOT NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles club_row
      JOIN public.roles cr ON cr.id = club_row.role_id
      WHERE (
          (r.name IN ('secretary', 'trial_secretary') AND cr.name IN ('secretary', 'trial_secretary'))
          OR (r.name = 'chairman' AND cr.name = 'chairman')
        )
        AND club_row.user_id = ur.user_id
        AND club_row.show_id IS NULL
        AND club_row.club_id = s.club_id
        AND club_row.is_active = true
        AND (club_row.expires_at IS NULL OR club_row.expires_at > NOW())
    );

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Refusing to proceed: % show-scoped secretary/chairman row(s) have no club appointment and would lose access. Appoint those people at the show''s club first (grant_club_secretary), then re-run.',
      v_orphans
      USING ERRCODE = 'data_exception';
  END IF;
END;
$$;

-- 3. Copy the naming across. Active rows only — an inactive assignment is not a current
--    official and must not come back to life as one.
INSERT INTO public.show_officials (show_id, person_id, role, created_by, created_at)
SELECT ur.show_id, ur.user_id, r.name, ur.granted_by, COALESCE(ur.granted_at, now())
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
WHERE ur.show_id IS NOT NULL
  AND ur.is_active = true
  AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  AND r.name IN ('secretary', 'chairman', 'steward')
ON CONFLICT (show_id, person_id, role) DO NOTHING;

-- 4. Retire the show-scoped grants. Deactivated rather than deleted: the rows are the
--    audit trail of who was named when, and is_active = false is already how every read
--    helper spells "does not grant". Steps 8-14 then remove the arms themselves.
UPDATE public.user_roles ur
SET is_active = false
FROM public.roles r
WHERE r.id = ur.role_id
  AND ur.show_id IS NOT NULL
  AND ur.is_active = true
  -- Stewards deliberately excluded: their show-scoped row is a ring assignment
  -- that still grants (MYK9-114), not a paperwork label being retired.
  AND r.name IN ('secretary', 'chairman');

-- 5. Naming someone writes the label, and nothing else.
CREATE OR REPLACE FUNCTION public.grant_show_official(
  p_person_id uuid,
  p_role_name text,
  p_show_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id           uuid;
  v_existing_id       uuid;
  v_caller_auth       uuid;
  v_caller_person_id  uuid;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_role_name NOT IN ('secretary', 'chairman', 'steward') THEN
    RAISE EXCEPTION 'role "%" cannot be granted via grant_show_official — only secretary, chairman, steward allowed', p_role_name
      USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show not found' USING ERRCODE = '22023';
  END IF;

  -- Unchanged from migration 146, and still the right check even though this now only
  -- writes a label: who appears on a club's paperwork is the club's business.
  -- is_show_official() stays excluded — letting an official name others would let a
  -- steward escalate a third party.
  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to grant officials on this show' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'person not found' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_caller_person_id
  FROM public.people WHERE auth_user_id = v_caller_auth;

  INSERT INTO public.show_officials (show_id, person_id, role, created_by)
  VALUES (p_show_id, p_person_id, p_role_name, v_caller_person_id)
  ON CONFLICT (show_id, person_id, role) DO UPDATE
    SET created_by = EXCLUDED.created_by
  RETURNING id INTO v_existing_id;

  -- A steward is the exception, and it is not a paperwork exception: naming
  -- someone steward of a show is a ring assignment that has always granted
  -- operational access, MYK9-114 pins it, and both callers of this RPC
  -- (ShowOfficialsEditor and the creation wizard's grantShowOfficials) offer
  -- the role. Only secretary and chairman become label-only here.
  IF p_role_name = 'steward' THEN
    INSERT INTO public.user_roles (user_id, role_id, show_id, club_id, is_active, granted_by, auth_user_id)
    SELECT p_person_id, r.id, p_show_id, v_club_id, true, v_caller_person_id, pe.auth_user_id
    FROM public.roles r
    CROSS JOIN LATERAL (SELECT auth_user_id FROM public.people WHERE id = p_person_id) pe
    WHERE r.name = 'steward'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_person_id
          AND ur.role_id = r.id
          AND ur.show_id = p_show_id
      );

    UPDATE public.user_roles ur
    SET is_active = true
    FROM public.roles r
    WHERE r.id = ur.role_id
      AND r.name = 'steward'
      AND ur.user_id = p_person_id
      AND ur.show_id = p_show_id;
  END IF;

  RETURN v_existing_id;
END;
$$;

COMMENT ON FUNCTION public.grant_show_official(uuid, text, uuid) IS
  'Names someone on a show''s paperwork. For secretary and chairman this grants NO permissions — show access comes from a club appointment (grant_club_secretary). Steward is different: it is a ring assignment and still grants show-scoped access (MYK9-114). Naming does not require the person to have a login.';

REVOKE ALL ON FUNCTION public.grant_show_official(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_show_official(uuid, text, uuid) TO authenticated;

-- 6. Un-naming, which had no RPC at all while the label lived in user_roles.
CREATE OR REPLACE FUNCTION public.revoke_show_official(
  p_person_id uuid,
  p_role_name text,
  p_show_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to change officials on this show' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.show_officials
  WHERE show_id = p_show_id
    AND person_id = p_person_id
    AND role = p_role_name;

  -- Mirror of the grant: un-naming a steward must also withdraw the ring
  -- assignment, or revoke would report success while access remained.
  IF p_role_name = 'steward' THEN
    UPDATE public.user_roles ur
    SET is_active = false
    FROM public.roles r
    WHERE r.id = ur.role_id
      AND r.name = 'steward'
      AND ur.user_id = p_person_id
      AND ur.show_id = p_show_id
      AND ur.is_active = true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.revoke_show_official(uuid, text, uuid) IS
  'Removes someone from a show''s paperwork. For secretary and chairman this does not touch show access, which comes from a club appointment. For steward it also withdraws the show-scoped ring assignment that naming granted.';

REVOKE ALL ON FUNCTION public.revoke_show_official(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_show_official(uuid, text, uuid) TO authenticated;

-- 7. The paperwork reader follows the label. Return shape is unchanged, so
--    useEntryFormData and the PDF fill need no edit.
CREATE OR REPLACE FUNCTION public.get_show_officials(p_show_id uuid)
RETURNS TABLE (user_id uuid, first_name text, last_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    so.person_id AS user_id,
    pe.first_name,
    pe.last_name,
    pe.email,
    so.role
  FROM public.show_officials so
  JOIN public.shows s ON s.id = so.show_id
  JOIN public.people pe ON pe.id = so.person_id
  WHERE so.show_id = p_show_id
    AND s.deleted_at IS NULL
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.get_show_officials(uuid) IS
  'Who is named on this show''s paperwork, from show_officials. Naming is not a permission; see grant_club_secretary for access.';

REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated;

-- 8. Being named on a show stops granting access. Only the show_id arm goes; the
--    club-scoped arm above it already carries every real caller.
CREATE OR REPLACE FUNCTION public.is_show_secretary(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (
          r.name = 'secretary'
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_show_secretary(uuid) IS
  'True for a site admin or a secretary appointed at the show''s club. Being named on the show (show_officials) grants nothing.';

REVOKE ALL ON FUNCTION public.is_show_secretary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_secretary(uuid) TO anon, authenticated;

-- 9. Same for the three staff roles together.
CREATE OR REPLACE FUNCTION public.is_show_official(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (
          r.name IN ('secretary', 'chairman', 'steward')
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
        -- A steward's show-scoped row is NOT a paperwork label. MYK9-114 pins
        -- show- and club-scoped stewards as equals
        -- (myk9_114_entry_access_context_test.sql, "show- and club-scoped
        -- stewards preserve row-only access"), and a steward is an operational
        -- per-show ring assignment rather than a name printed on a form. Only
        -- the secretary and chairman arms move to show_officials.
        OR (r.name = 'steward' AND ur.show_id = check_show_id)
      )
  );
$$;

COMMENT ON FUNCTION public.is_show_official(uuid) IS
  'True for a site admin, a secretary/chairman/steward appointed at the show''s club, or a steward assigned to this show. Being NAMED on the show as secretary or chairman grants nothing.';

REVOKE ALL ON FUNCTION public.is_show_official(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_official(uuid) TO anon, authenticated;

-- 10. The office-manager check loses its show-scoped EXISTS block.
--
-- The `s.club_id IS NOT NULL` guards are MYK9-258 and MUST stay. is_club_admin
-- and is_trial_secretary treat a NULL argument as "no club filter", so passing a
-- club-less show's NULL club_id positionally makes that show manageable by every
-- active secretary and club admin on the platform -- and get_entries_for_export
-- then hands each of them owner email and phone. Removing the show-scoped arm
-- here is not a licence to drop these.
CREATE OR REPLACE FUNCTION public.is_show_office_manager(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shows s
    WHERE s.id = check_show_id
      AND (
        (SELECT public.is_site_admin())
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_show_office_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_office_manager(uuid) TO authenticated, service_role;

-- 11. And so does the manageable-shows set.
CREATE OR REPLACE FUNCTION public.manageable_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.shows s
  -- The `s.club_id IS NOT NULL` guards are MYK9-258; see the note above
  -- is_show_office_manager. A club-less show must reach nobody but a site admin.
  WHERE (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
     OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
     OR (SELECT public.is_site_admin());
$$;

COMMENT ON FUNCTION public.manageable_show_ids() IS
  'Set of shows the caller may manage: club admins, secretaries appointed at the show''s club, and site admins. Being named on a show grants nothing.';

REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO authenticated, service_role;

-- 12. Ringside passcodes: a steward must be appointed at the club.
CREATE OR REPLACE FUNCTION public.get_show_access_codes(p_show_id uuid)
RETURNS TABLE(role text, passcode text, recoverable boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_club_id uuid;
  v_allowed_roles text[] := array[]::text[];
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
    v_allowed_roles := array['admin', 'judge', 'steward', 'exhibitor'];
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

  return query
    select
      sp.role,
      case
        when sp.passcode_ciphertext is null then null
        else public._decrypt_show_passcode(sp.passcode_ciphertext)
      end as passcode,
      sp.passcode_ciphertext is not null as recoverable
    from public.show_passcodes sp
    where sp.show_id = p_show_id
      and sp.role = any(v_allowed_roles)
    order by case sp.role
      when 'admin' then 1
      when 'judge' then 2
      when 'steward' then 3
      when 'exhibitor' then 4
      else 5
    end;
end
$function$;

REVOKE ALL ON FUNCTION public.get_show_access_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_access_codes(uuid) TO authenticated;

-- 13. Class hide counts: same steward edit as the passcode reader.
CREATE OR REPLACE FUNCTION public.get_show_class_hide_counts(p_show_id uuid)
RETURNS TABLE(class_id uuid, num_hides integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_club_id               uuid;
  v_caller_person_id      uuid;
  v_is_manager            boolean;
  v_is_steward            boolean;
  v_claim_kind            text;
  v_claim_show_id         text;
  v_claim_role            text;
  v_has_passcode_official boolean;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RETURN;  -- unknown show: empty, not an error, so existence is not disclosed
  END IF;

  -- NULL for a passcode/anonymous session, which has no person row.
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  -- Both scopes, same reason as the passcode reader above (MYK9-114).
  v_is_steward := EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.auth_user_id = (SELECT auth.uid())
       AND r.name = 'steward'
       AND ur.is_active
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
       AND (
         ur.show_id = p_show_id
         OR (ur.show_id IS NULL AND ur.club_id = v_club_id)
       )
  );

  v_claim_kind    := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role    := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';

  v_has_passcode_official :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = p_show_id::text
    AND v_claim_role IN ('judge', 'admin', 'steward')
    AND public.ringside_claim_generation_current() IS NOT DISTINCT FROM true;

  RETURN QUERY
  SELECT c.id, c.num_hides
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE t.show_id = p_show_id
     AND c.deleted_at IS NULL
     AND (
       v_is_manager
       OR v_is_steward
       OR v_has_passcode_official
       -- An account-holding judge sees only the classes assigned to them.
       OR (
         v_caller_person_id IS NOT NULL
         AND EXISTS (
           SELECT 1
             FROM public.judge_assignments ja
            WHERE ja.person_id = v_caller_person_id
              AND ja.class_id = c.id
              AND ja.status IN ('confirmed', 'invited')
         )
       )
     );
END;
$function$;

-- anon keeps EXECUTE: a ringside passcode session is anon, and the body gates it on
-- the ringside claim. Stated as an explicit revoke-then-grant so the decision is
-- recorded rather than inherited.
REVOKE ALL ON FUNCTION public.get_show_class_hide_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_hide_counts(uuid) TO anon, authenticated;

-- 14. The cached results authorization context. Its managed_show_ids and
--     managed_show_ids array existed only to carry show-scoped SECRETARY grants, so it is now
--     empty by construction rather than by luck. The club-scoped arrays beside them
--     (managed_club_ids) carries every real manager. steward_show_ids is NOT emptied:
--     MYK9-114 pins show-scoped stewards, whose rows are ring assignments rather
--     than paperwork labels.
--
--     CREATE OR REPLACE, never DROP: view_authenticated_entry_results depends on this
--     function and the signature is unchanged. Recreating that view would reset its
--     reloptions and silently flip security_invoker from false.
CREATE OR REPLACE FUNCTION private.entry_results_caller_context()
RETURNS TABLE (
  auth_user_id uuid,
  person_id uuid,
  is_site_admin boolean,
  has_manager_role boolean,
  managed_club_ids uuid[],
  managed_show_ids uuid[],
  assigned_class_ids uuid[],
  steward_show_ids uuid[],
  steward_club_ids uuid[],
  claim_kind text,
  claim_show_id text,
  claim_role text,
  claim_generation_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller_identity AS MATERIALIZED (
    SELECT
      auth.uid() AS auth_user_id,
      (
        SELECT p.id
        FROM public.people p
        WHERE p.auth_user_id = auth.uid()
        LIMIT 1
      ) AS person_id,
      auth.jwt() AS jwt
  ),
  role_context AS MATERIALIZED (
    SELECT
      COALESCE(bool_or(r.name = 'site_admin'), false) AS is_site_admin,
      COALESCE(
        bool_or(
          r.name = 'club_admin'
          OR (
            r.name IN ('secretary', 'trial_secretary')
            AND ur.show_id IS NULL
          )
        ),
        false
      ) AS has_manager_role,
      COALESCE(array_agg(DISTINCT ur.club_id) FILTER (
        WHERE (
          r.name = 'club_admin'
          OR (
            r.name IN ('secretary', 'trial_secretary')
            AND ur.show_id IS NULL
            AND ur.club_id IS NOT NULL
          )
        )
      ), ARRAY[]::uuid[]) AS managed_club_ids,
      -- steward_show_ids stays populated: MYK9-114 pins show-scoped stewards as
      -- equals of club-scoped ones, and a ring assignment is not paperwork.
      COALESCE(array_agg(DISTINCT ur.show_id) FILTER (
        WHERE r.name = 'steward'
          AND ur.show_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS steward_show_ids,
      COALESCE(array_agg(DISTINCT ur.club_id) FILTER (
        WHERE r.name = 'steward'
          AND ur.show_id IS NULL
          AND ur.club_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS steward_club_ids
    FROM caller_identity ci
    LEFT JOIN public.user_roles ur
      ON ur.auth_user_id = ci.auth_user_id
     AND ur.is_active
     AND (ur.expires_at IS NULL OR ur.expires_at > now())
    LEFT JOIN public.roles r ON r.id = ur.role_id
  ),
  judge_context AS MATERIALIZED (
    SELECT COALESCE(array_agg(DISTINCT ja.class_id) FILTER (
      WHERE ja.class_id IS NOT NULL
    ), ARRAY[]::uuid[]) AS assigned_class_ids
    FROM caller_identity ci
    LEFT JOIN public.judge_assignments ja
      ON ja.person_id = ci.person_id
     AND ja.status IN ('confirmed', 'invited')
  )
  SELECT
    ci.auth_user_id,
    ci.person_id,
    rc.is_site_admin,
    rc.has_manager_role,
    rc.managed_club_ids,
    -- Show-scoped grants no longer exist. Kept in the signature because the view reads
    -- these columns; always empty because nothing may grant through them.
    ARRAY[]::uuid[] AS managed_show_ids,
    jc.assigned_class_ids,
    rc.steward_show_ids,
    rc.steward_club_ids,
    ci.jwt -> 'app_metadata' ->> 'kind' AS claim_kind,
    nullif(ci.jwt -> 'app_metadata' ->> 'show_id', '') AS claim_show_id,
    ci.jwt -> 'app_metadata' ->> 'ringside_role' AS claim_role,
    public.ringside_claim_generation_current() AS claim_generation_current
  FROM caller_identity ci
  CROSS JOIN role_context rc
  CROSS JOIN judge_context jc;
$$;

COMMENT ON FUNCTION private.entry_results_caller_context() IS
  'Internal MYK9-114 helper. Manager context is club-scoped only; being named on a show as secretary or chairman grants nothing. Steward context keeps both scopes -- a show-scoped steward row is a ring assignment. Membership is not consulted.';

-- 15. The one path that could still mint a show-scoped official row. It must not do so
--     SILENTLY now that such a row grants nothing: a site admin approving a "secretary
--     for this show" request would otherwise get a success and hand over no access at
--     all. Fail loudly and say where the two halves actually live.
CREATE OR REPLACE FUNCTION public.approve_role_request(
  p_request_id uuid,
  p_club_id uuid,
  p_show_id uuid DEFAULT NULL::uuid,
  p_reviewer_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.role_requests%ROWTYPE;
  v_reviewer_person_id uuid;
  v_role_id uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only site admins can approve role requests' USING ERRCODE = '42501';
  END IF;

  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'A club is required before approving this role request'
      USING ERRCODE = '23514';
  END IF;

  IF p_show_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shows WHERE id = p_show_id AND club_id = p_club_id
  ) THEN
    RAISE EXCEPTION 'Show % does not belong to club %', p_show_id, p_club_id
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.role_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found' USING ERRCODE = 'P0002';
  END IF;

  -- A show-scoped official row no longer grants anything, so creating one here would
  -- report success and change nothing the requester can feel.
  IF p_show_id IS NOT NULL
     AND v_request.requested_role IN ('secretary', 'trial_secretary', 'chairman', 'steward') THEN
    RAISE EXCEPTION
      'Show-scoped "%" grants no access. Appoint them at the club with grant_club_secretary, and name them on the show with grant_show_official.',
      v_request.requested_role
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = v_request.requested_role;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Requested role "%" does not exist', v_request.requested_role
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_roles
  SET is_active = true, granted_at = now(), granted_by = v_reviewer_person_id
  WHERE user_id = v_request.person_id
    AND role_id = v_role_id
    AND club_id = p_club_id
    AND ((show_id IS NULL AND p_show_id IS NULL) OR show_id = p_show_id);

  IF NOT FOUND THEN
    INSERT INTO public.user_roles (
      user_id, role_id, club_id, show_id, is_active, granted_at, granted_by
    ) VALUES (
      v_request.person_id, v_role_id, p_club_id, p_show_id, true, now(), v_reviewer_person_id
    );
  END IF;

  UPDATE public.role_requests
  SET status = 'approved',
      club_id = p_club_id,
      show_id = p_show_id,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now(),
      reviewer_note = COALESCE(p_reviewer_note, reviewer_note)
  WHERE id = p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_role_request(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_role_request(uuid, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
