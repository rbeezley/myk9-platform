begin;

create table if not exists public.show_lifecycle_email_steps (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  step_type text not null check (
    step_type in (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available'
    )
  ),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, step_type)
);

create table if not exists public.show_lifecycle_email_jobs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  step_id uuid not null references public.show_lifecycle_email_steps(id) on delete cascade,
  step_type text not null check (
    step_type in (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available'
    )
  ),
  status text not null default 'ready' check (
    status in ('ready', 'sent', 'failed', 'skipped', 'dismissed')
  ),
  recipient_scope text not null check (
    recipient_scope in ('entry', 'enrollment', 'show_recipient')
  ),
  entry_id uuid references public.entries(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  recipient_person_id uuid references public.people(id) on delete set null,
  recipient_email text,
  recipient_name text,
  subject text,
  body text,
  secretary_note text,
  rendered_subject text,
  rendered_body text,
  rendered_secretary_note text,
  preview_warnings jsonb not null default '[]'::jsonb,
  batch_key text,
  correction_for_job_id uuid references public.show_lifecycle_email_jobs(id) on delete set null,
  idempotency_key text not null,
  email_log_id uuid references public.email_log(id) on delete set null,
  due_at timestamptz not null default now(),
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  skipped_at timestamptz,
  dismissed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    jsonb_typeof(preview_warnings) = 'array'
  ),
  check (
    (status = 'sent' and sent_at is not null)
    or status <> 'sent'
  ),
  check (
    (status = 'skipped' and skipped_at is not null)
    or status <> 'skipped'
  ),
  check (
    (status = 'dismissed' and dismissed_at is not null)
    or status <> 'dismissed'
  )
);

create table if not exists public.show_lifecycle_email_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.show_lifecycle_email_jobs(id) on delete cascade,
  email_log_id uuid references public.email_log(id) on delete set null,
  resend_message_id text,
  status text not null check (
    status in ('sent', 'failed', 'delivered', 'bounced', 'complained', 'delayed')
  ),
  error_message text,
  attempted_by uuid references auth.users(id) on delete set null,
  attempted_at timestamptz not null default now()
);

create unique index if not exists show_lifecycle_email_jobs_idempotency_key_idx
  on public.show_lifecycle_email_jobs (idempotency_key);

create index if not exists show_lifecycle_email_jobs_show_status_due_idx
  on public.show_lifecycle_email_jobs (show_id, status, due_at)
  where status = 'ready';

create index if not exists show_lifecycle_email_jobs_step_status_idx
  on public.show_lifecycle_email_jobs (step_id, status);

create index if not exists show_lifecycle_email_jobs_email_log_id_idx
  on public.show_lifecycle_email_jobs (email_log_id)
  where email_log_id is not null;

create index if not exists show_lifecycle_email_jobs_batch_status_idx
  on public.show_lifecycle_email_jobs (show_id, batch_key, status)
  where batch_key is not null;

create index if not exists show_lifecycle_email_attempts_job_attempted_idx
  on public.show_lifecycle_email_attempts (job_id, attempted_at desc);

create index if not exists show_lifecycle_email_attempts_email_log_id_idx
  on public.show_lifecycle_email_attempts (email_log_id)
  where email_log_id is not null;

create or replace function public.touch_show_lifecycle_email_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_show_lifecycle_email_steps_touch on public.show_lifecycle_email_steps;
create trigger trg_show_lifecycle_email_steps_touch
  before update on public.show_lifecycle_email_steps
  for each row
  execute function public.touch_show_lifecycle_email_updated_at();

drop trigger if exists trg_show_lifecycle_email_jobs_touch on public.show_lifecycle_email_jobs;
create trigger trg_show_lifecycle_email_jobs_touch
  before update on public.show_lifecycle_email_jobs
  for each row
  execute function public.touch_show_lifecycle_email_updated_at();

create or replace function public.can_manage_show_lifecycle_email(p_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_site_admin()
    or public.is_show_secretary(p_show_id)
    or exists (
      select 1
      from public.shows s
      where s.id = p_show_id
        and s.club_id is not null
        and (
          public.is_club_admin(s.club_id)
          or public.is_trial_secretary(s.club_id)
        )
    ),
    false
  );
$$;

grant execute on function public.can_manage_show_lifecycle_email(uuid) to authenticated;

create or replace function public.ensure_show_lifecycle_email_steps(p_show_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled)
  values
    (p_show_id, 'accepted', true),
    (p_show_id, 'waitlisted', true),
    (p_show_id, 'two_week_reminder', true),
    (p_show_id, 'day_before_reminder', true),
    (p_show_id, 'results_available', true)
  on conflict (show_id, step_type) do nothing;
$$;

create or replace function public.ensure_show_lifecycle_email_steps_for_new_show()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_show_lifecycle_email_steps(new.id);
  return new;
end;
$$;

insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled)
select s.id, step_type, true
from public.shows s
cross join (
  values
    ('accepted'),
    ('waitlisted'),
    ('two_week_reminder'),
    ('day_before_reminder'),
    ('results_available')
) as default_steps(step_type)
on conflict (show_id, step_type) do nothing;

drop trigger if exists trg_ensure_show_lifecycle_email_steps on public.shows;
create trigger trg_ensure_show_lifecycle_email_steps
  after insert on public.shows
  for each row
  execute function public.ensure_show_lifecycle_email_steps_for_new_show();

alter table public.show_lifecycle_email_steps enable row level security;
alter table public.show_lifecycle_email_jobs enable row level security;
alter table public.show_lifecycle_email_attempts enable row level security;

grant select, update on public.show_lifecycle_email_steps to authenticated;
grant select, update on public.show_lifecycle_email_jobs to authenticated;
grant select on public.show_lifecycle_email_attempts to authenticated;

grant all on public.show_lifecycle_email_steps to service_role;
grant all on public.show_lifecycle_email_jobs to service_role;
grant all on public.show_lifecycle_email_attempts to service_role;

drop policy if exists "lifecycle_steps_select_show_managers" on public.show_lifecycle_email_steps;
create policy "lifecycle_steps_select_show_managers"
  on public.show_lifecycle_email_steps
  for select to authenticated
  using (public.can_manage_show_lifecycle_email(show_id));

drop policy if exists "lifecycle_steps_update_show_managers" on public.show_lifecycle_email_steps;
create policy "lifecycle_steps_update_show_managers"
  on public.show_lifecycle_email_steps
  for update to authenticated
  using (public.can_manage_show_lifecycle_email(show_id))
  with check (public.can_manage_show_lifecycle_email(show_id));

drop policy if exists "lifecycle_jobs_select_show_managers" on public.show_lifecycle_email_jobs;
create policy "lifecycle_jobs_select_show_managers"
  on public.show_lifecycle_email_jobs
  for select to authenticated
  using (public.can_manage_show_lifecycle_email(show_id));

drop policy if exists "lifecycle_jobs_update_show_managers" on public.show_lifecycle_email_jobs;
create policy "lifecycle_jobs_update_show_managers"
  on public.show_lifecycle_email_jobs
  for update to authenticated
  using (public.can_manage_show_lifecycle_email(show_id))
  with check (public.can_manage_show_lifecycle_email(show_id));

drop policy if exists "lifecycle_attempts_select_show_managers" on public.show_lifecycle_email_attempts;
create policy "lifecycle_attempts_select_show_managers"
  on public.show_lifecycle_email_attempts
  for select to authenticated
  using (
    exists (
      select 1
      from public.show_lifecycle_email_jobs j
      where j.id = show_lifecycle_email_attempts.job_id
        and public.can_manage_show_lifecycle_email(j.show_id)
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'show_lifecycle_email_steps'
  ) then
    raise exception 'show_lifecycle_email_steps table missing';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where c.relname = 'show_lifecycle_email_jobs_idempotency_key_idx'
      and i.indisunique
  ) then
    raise exception 'show_lifecycle_email_jobs idempotency unique index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'show_lifecycle_email_jobs'
      and indexname = 'show_lifecycle_email_jobs_show_status_due_idx'
  ) then
    raise exception 'show_lifecycle_email_jobs due index missing';
  end if;

  if not exists (
    select 1
    from pg_policy
    where polname = 'lifecycle_jobs_select_show_managers'
  ) then
    raise exception 'show_lifecycle_email_jobs manager select policy missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'show_lifecycle_email_jobs_email_log_id_fkey'
  ) then
    raise exception 'show_lifecycle_email_jobs email_log foreign key missing';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'show_lifecycle_email_attempts'
  ) then
    raise exception 'show_lifecycle_email_attempts table missing';
  end if;
end;
$$;

comment on table public.show_lifecycle_email_steps is
  'Per-show lifecycle email step settings. New shows get reviewed lifecycle steps enabled by default.';

comment on table public.show_lifecycle_email_jobs is
  'Per-recipient lifecycle email work queue for ready, sent, failed, skipped, dismissed, and correction history.';

comment on table public.show_lifecycle_email_attempts is
  'Delivery attempts for lifecycle email jobs, linked to email_log and Resend message ids when available.';

commit;
