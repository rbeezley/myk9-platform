-- =============================================================================
-- Migration 20260805120000: make the sign-in email invariant real (MYK9-136)
--
-- Nothing has ever kept `people.email` and `auth.users.email` in sync — no
-- trigger on either table touches email — while the admin edit panel rewrote
-- the contact email freely. A "corrected" address left that person signing in
-- with the old one while every screen showed the new one, and their row could
-- no longer be adopted at signup (`handle_new_user()` matches on
-- `LOWER(people.email)`), so a second person was created instead.
--
-- #1623 added a client-side guard in `updateUser`. That is the affordance, not
-- the boundary: a direct PostgREST update bypasses it entirely, and even for
-- callers that do use it, reading the linkage and writing the row are two
-- requests, so a signup can adopt the person in between. This migration moves
-- the invariant into the database, where it cannot be routed around.
--
-- THE INVARIANT, stated precisely:
--
--     for a person with an auth identity, people.email = auth.users.email
--
-- Note what that permits, and why the weaker "a linked person's email may
-- never change" would have been wrong:
--   * repair TOWARD the identity address stays legal, which is the only sane
--     direction to repair in;
--   * a future "propagate the change into the auth identity" flow (option 1 on
--     MYK9-136) needs no change here — update the identity first, then the
--     person row, and the trigger is satisfied;
--   * `scripts/setup-e2e-test-users.ts` keeps working. It updates people rows
--     by `auth_user_id` and writes the same address it created the auth user
--     with, so it satisfies the invariant. A blanket ban would have broken it.
--
-- Three parts:
--   1. The trigger that enforces it.
--   2. `handle_new_user()` adoption made atomic with respect to the address it
--      matched on — the remaining race the client guard cannot close.
--   3. A drift fact on the health probe, so a violation arriving by any route
--      we have not thought of is discovered rather than stumbled upon.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. The invariant
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because it reads auth.users, which the invoking role cannot.
-- It only ever reads the one row named by the person's own auth_user_id, and it
-- returns no data — the exception text deliberately does not quote the identity
-- address, so this cannot be used to enumerate auth emails.
create or replace function public.enforce_sign_in_email_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity_email text;
begin
  -- No identity: the contact email is only ever a contact email. Editing it is
  -- ordinary directory maintenance and stays allowed.
  if new.auth_user_id is null then
    return new;
  end if;

  -- `UPDATE OF email` fires when the column is assigned, not when its value
  -- moves, and nearly every save in the app assigns it. Compare normalized, so
  -- that re-saving the same address — including a differently cased or padded
  -- variant — is not treated as a change.
  if lower(coalesce(new.email, '')) = lower(coalesce(old.email, '')) then
    return new;
  end if;

  select u.email into v_identity_email
    from auth.users u
   where u.id = new.auth_user_id;

  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(v_identity_email, '')) then
    raise exception
      'This person signs in with a different email address. Update their sign-in identity first, or leave the contact address as it is.'
      using errcode = 'MK002',
            hint = 'people.email must match auth.users.email while auth_user_id is set (MYK9-136).';
  end if;

  return new;
end;
$$;

comment on function public.enforce_sign_in_email_match() is
  'MYK9-136: keeps people.email equal to auth.users.email for a person who can sign in. Raises MK002 on divergence.';

-- A trigger function needs no direct EXECUTE from anyone: Postgres checks that
-- privilege when the trigger is created, not each time it fires. Revoking from
-- PUBLIC as well as the two roles is what actually denies them — a revoke from
-- `anon` alone is inert while the function's default PUBLIC grant stands.
revoke all on function public.enforce_sign_in_email_match() from public;
revoke all on function public.enforce_sign_in_email_match() from anon;
revoke all on function public.enforce_sign_in_email_match() from authenticated;

drop trigger if exists people_enforce_sign_in_email on public.people;

create trigger people_enforce_sign_in_email
  before update of email on public.people
  for each row
  execute function public.enforce_sign_in_email_match();

-- -----------------------------------------------------------------------------
-- 2. Adoption made atomic
-- -----------------------------------------------------------------------------
-- Re-emitted from 20260625000000_skip_anon_users_in_new_user_trigger.sql, the
-- latest definition. The ONLY change is to the adoption branch: the SELECT that
-- picks the person to adopt does not lock it, so between that read and the
-- UPDATE another transaction can change the address or link the row. Restating
-- both conditions in the UPDATE's WHERE makes Postgres re-check them under the
-- row lock it takes anyway; if the row moved, we fall through and create a
-- person instead of linking an identity to an address it never matched.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
DECLARE
  existing_person_id UUID;
  new_person_id      UUID;
  exhibitor_role_id  UUID;
BEGIN
  -- Anonymous users are transient ringside passcode device sessions (enabled for
  -- offline at-show scoring), NOT people/exhibitors. Skip all person/profile/role/
  -- role-request creation so they don't pollute core tables and remain cascade-
  -- deletable. See migration 20260625000000 for the full rationale.
  IF NEW.is_anonymous THEN
    RETURN NEW;
  END IF;

  SELECT id INTO exhibitor_role_id
    FROM public.roles
    WHERE name = 'exhibitor';

  SELECT id INTO existing_person_id
    FROM public.people
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1;

  IF existing_person_id IS NOT NULL THEN
    UPDATE public.people SET
      auth_user_id    = NEW.id,
      first_name      = COALESCE(NEW.raw_user_meta_data->>'first_name', first_name),
      last_name       = COALESCE(NEW.raw_user_meta_data->>'last_name', last_name),
      phone           = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
      agreed_to_tos_at = COALESCE(agreed_to_tos_at, NOW()),
      updated_at      = now()
    WHERE id = existing_person_id
      -- Re-checked under the row lock: the person must still be unlinked and
      -- must still carry the address we matched on. MYK9-136.
      AND auth_user_id IS NULL
      AND LOWER(email) = LOWER(NEW.email)
      AND deleted_at IS NULL;

    IF FOUND THEN
      new_person_id := existing_person_id;
    ELSE
      -- Adopted or renamed under us. Treat it as no match.
      existing_person_id := NULL;
    END IF;
  END IF;

  IF existing_person_id IS NULL THEN
    INSERT INTO public.people (
      first_name,
      last_name,
      email,
      phone,
      auth_user_id,
      agreed_to_tos_at
    ) VALUES (
      COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      NEW.id,
      NOW()
    )
    RETURNING id INTO new_person_id;
  END IF;

  INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
  VALUES (new_person_id, NEW.id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  IF exhibitor_role_id IS NOT NULL THEN
    UPDATE public.user_roles
      SET is_active = true
      WHERE user_id  = new_person_id
        AND role_id  = exhibitor_role_id
        AND club_id  IS NULL
        AND show_id  IS NULL;

    IF NOT FOUND THEN
      INSERT INTO public.user_roles (user_id, role_id, is_active)
      VALUES (new_person_id, exhibitor_role_id, true);
    END IF;
  END IF;

  PERFORM public.insert_signup_role_requests(
    NEW.id,
    new_person_id,
    COALESCE(NEW.raw_user_meta_data->'intended_roles', '[]'::jsonb)
  );

  RETURN NEW;
END;
$function$;

-- Same reasoning as above, and a tightening this function never had: it is
-- SECURITY DEFINER and has carried its default PUBLIC EXECUTE since migration
-- 009. It fires from `on_auth_user_created` under supabase_auth_admin, which is
-- unaffected.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- -----------------------------------------------------------------------------
-- 3. Drift detection
-- -----------------------------------------------------------------------------
-- The count should be permanently zero now. That is exactly why it is worth
-- reporting: a non-zero value means the invariant was reached by a route this
-- migration does not cover (a direct owner-role write, a restore, a migration),
-- and the whole point of MYK9-136 is that this failure mode is invisible until
-- someone cannot sign in.
create or replace function public.sign_in_email_drift()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with drifted as (
    select p.id
      from public.people p
      join auth.users u on u.id = p.auth_user_id
     where p.deleted_at is null
       and lower(coalesce(p.email, '')) <> lower(coalesce(u.email, ''))
     order by p.updated_at desc
  )
  select jsonb_build_object(
    'drifted', (select count(*) from drifted),
    'sample',  (select coalesce(jsonb_agg(d.id), '[]'::jsonb)
                  from (select id from drifted limit 5) d)
  );
$$;

comment on function public.sign_in_email_drift() is
  'MYK9-136: people whose contact email no longer matches their sign-in identity. Expected to be zero; non-zero means the invariant was bypassed.';

revoke all on function public.sign_in_email_drift() from public;
revoke all on function public.sign_in_email_drift() from anon;
revoke all on function public.sign_in_email_drift() from authenticated;
grant execute on function public.sign_in_email_drift() to service_role;

-- Re-emitted from 20260804161000_continuous_health_checks_and_run_now.sql, the
-- latest definition, with the drift fact added to BOTH paths. The expensive
-- path delegates to the zero-argument probe, so the fact is merged onto its
-- result rather than duplicated into that 250-line function.
create or replace function public.system_health_probe(p_include_expensive boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_include_expensive then
    return public.system_health_probe()
           || jsonb_build_object('sign_in_email_drift', public.sign_in_email_drift());
  end if;

  return jsonb_build_object(
    'probed_at', now(),
    'latest_migration', (
      select version
      from supabase_migrations.schema_migrations
      order by version desc
      limit 1
    ),
    'migration_count', (
      select count(*)
      from supabase_migrations.schema_migrations
    ),
    'ringside_conflict_counter', (
      select coalesce(last_value, 0)
      from pg_sequences
      where schemaname = 'public' and sequencename = 'ringside_conflict_seq'
    ),
    'sign_in_email_drift', public.sign_in_email_drift(),
    'ringside_containment', (
      select jsonb_build_object(
        'state',                     c.state,
        'tripped_at',                c.tripped_at,
        'trip_conflict_delta',       c.trip_conflict_delta,
        'trip_reason',               c.trip_reason,
        'trip_conflicts_per_minute', c.trip_conflicts_per_minute,
        'backpressure_ms',           c.backpressure_ms,
        'calibrated',                c.calibrated,
        'last_sample_at',            c.last_sample_at
      )
      from public.ringside_containment c
    ),
    'payout_ledger', (
      with latest as (
        select distinct on (p.show_id) p.*
        from public.show_payouts p
        order by p.show_id, p.created_at desc
      )
      select jsonb_build_object(
        'total',               count(*),
        'failed',              count(*) filter (where l.status = 'failed'),
        'failed_amount_cents', coalesce(sum(l.amount_cents) filter (where l.status = 'failed'), 0),
        'in_flight',           count(*) filter (where l.status in ('pending', 'processing')),
        'stale_in_flight',     count(*) filter (
                                 where l.status = 'processing'
                                   and l.updated_at < now() - interval '26 hours'
                               ),
        'oldest_in_flight_at', min(l.updated_at) filter (where l.status = 'processing'),
        'last_completed_at',   max(l.completed_at) filter (where l.status = 'completed'),
        'failure_reasons', (
          select coalesce(jsonb_agg(distinct f.failure_reason), '[]'::jsonb)
          from latest f
          where f.status = 'failed' and f.failure_reason is not null
        )
      )
      from latest l
    ),
    'cron_jobs', (
      select coalesce(jsonb_agg(j order by j->>'jobname'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'jobname',          job.jobname,
          'active',           job.active,
          'dispatches_http',  (position('net.http_post' in coalesce(job.command, '')) > 0),
          'last_status',      lr.status,
          'last_start',       lr.start_time,
          'last_end',         lr.end_time,
          'last_message',     lr.return_message
        ) as j
        from cron.job job
        left join lateral (
          select status, start_time, end_time, return_message
          from cron.job_run_details d
          where d.jobid = job.jobid
          order by d.start_time desc nulls last
          limit 1
        ) lr on true
      ) sub
    )
  );
end;
$$;

comment on function public.system_health_probe(boolean) is
  'Read-only health facts for MYK9-157. p_include_expensive=false omits catalog-wide ACL scans for the continuous runner; true delegates to the full zero-argument probe. Carries the MYK9-136 sign-in email drift fact on both paths.';

revoke all on function public.system_health_probe(boolean) from public;
revoke all on function public.system_health_probe(boolean) from anon;
revoke all on function public.system_health_probe(boolean) from authenticated;
grant execute on function public.system_health_probe(boolean) to service_role;

commit;
