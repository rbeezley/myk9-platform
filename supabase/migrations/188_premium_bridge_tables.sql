-- supabase/migrations/188_premium_bridge_tables.sql
-- rollback: drop table public.premium_generations; drop table public.club_premium_templates;
--
-- Idempotent: an earlier draft of this migration (numbered 186 at the time)
-- was already applied against staging during development. To keep the file
-- safe on both fresh databases and that live database, every CREATE is
-- guarded with IF NOT EXISTS / drop-then-create / CREATE OR REPLACE.

create table if not exists public.club_premium_templates (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references public.clubs(id) on delete cascade,
  name                text not null,
  trial_type          text,
  is_default          boolean not null default false,
  style               text not null default 'classic' check (style in ('classic', 'modern', 'minimal')),
  vet_clinic_name     text,
  vet_clinic_address  text,
  vet_clinic_phone    text,
  accommodations      jsonb not null default '[]',
  hospitality_notes   text,
  awards_description  text,
  additional_notes    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- only one default per club
create unique index if not exists club_premium_templates_default_unique
  on public.club_premium_templates(club_id)
  where is_default = true;

create index if not exists club_premium_templates_club_type
  on public.club_premium_templates(club_id, trial_type);

-- keep updated_at current on every write
drop trigger if exists club_premium_templates_updated_at on public.club_premium_templates;
create trigger club_premium_templates_updated_at
  before update on public.club_premium_templates
  for each row execute function set_updated_at();

alter table public.club_premium_templates enable row level security;

-- single "for all" policy covers select + insert + update + delete
drop policy if exists "club members can manage premium templates" on public.club_premium_templates;
create policy "club members can manage premium templates"
  on public.club_premium_templates for all
  using (
    public.is_site_admin()
    or public.is_trial_secretary(club_id)
    or public.is_club_admin(club_id)
  )
  with check (
    public.is_site_admin()
    or public.is_trial_secretary(club_id)
    or public.is_club_admin(club_id)
  );

-- atomically clear the prior default when a new one is set, so that
-- "make this template the default" works without the caller having to
-- run two updates in a transaction.
create or replace function public.clear_prior_premium_default()
  returns trigger language plpgsql as $$
begin
  if new.is_default then
    update public.club_premium_templates
       set is_default = false
     where club_id = new.club_id
       and id <> new.id
       and is_default = true;
  end if;
  return new;
end;
$$;

drop trigger if exists club_premium_templates_clear_prior_default on public.club_premium_templates;
create trigger club_premium_templates_clear_prior_default
  before insert or update of is_default on public.club_premium_templates
  for each row when (new.is_default = true)
  execute function public.clear_prior_premium_default();

-- correction log
create table if not exists public.premium_generations (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references public.shows(id) on delete cascade,
  club_id         uuid not null references public.clubs(id) on delete cascade,
  template_id     uuid references public.club_premium_templates(id) on delete set null,
  org             text not null check (org in ('AKC', 'UKC')),
  generated_at    timestamptz not null default now(),
  field_overrides jsonb not null default '{}',
  narrative_edits jsonb not null default '{}'
);

-- If the table predates this migration, swap the template_id FK from
-- NO ACTION to SET NULL so deleting a referenced template doesn't block
-- on the audit log.
do $$
declare
  current_rule text;
begin
  select rc.delete_rule
    into current_rule
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu on kcu.constraint_name = rc.constraint_name
    join information_schema.table_constraints tc  on tc.constraint_name  = rc.constraint_name
   where tc.table_name='premium_generations'
     and tc.constraint_type='FOREIGN KEY'
     and kcu.column_name='template_id';

  if current_rule is not null and current_rule <> 'SET NULL' then
    alter table public.premium_generations
      drop constraint premium_generations_template_id_fkey;
    alter table public.premium_generations
      add constraint premium_generations_template_id_fkey
      foreign key (template_id) references public.club_premium_templates(id)
      on delete set null;
  end if;
end$$;

alter table public.premium_generations enable row level security;

drop policy if exists "club members can view premium generations" on public.premium_generations;
create policy "club members can view premium generations"
  on public.premium_generations for select
  using (
    public.is_site_admin()
    or public.is_trial_secretary(club_id)
    or public.is_club_admin(club_id)
  );

drop policy if exists "club members can log premium generations" on public.premium_generations;
create policy "club members can log premium generations"
  on public.premium_generations for insert
  with check (
    public.is_site_admin()
    or public.is_trial_secretary(club_id)
    or public.is_club_admin(club_id)
  );

-- index for consecutive-override detection query
create index if not exists premium_generations_club_generated
  on public.premium_generations(club_id, generated_at desc);
