-- supabase/migrations/186_premium_bridge_tables.sql
-- rollback: drop table public.premium_generations; drop table public.club_premium_templates;

create table public.club_premium_templates (
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
create unique index club_premium_templates_default_unique
  on public.club_premium_templates(club_id)
  where is_default = true;

create index club_premium_templates_club_type
  on public.club_premium_templates(club_id, trial_type);

-- keep updated_at current on every write
create trigger club_premium_templates_updated_at
  before update on public.club_premium_templates
  for each row execute function set_updated_at();

alter table public.club_premium_templates enable row level security;

-- single "for all" policy covers select + insert + update + delete
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

-- correction log
create table public.premium_generations (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references public.shows(id) on delete cascade,
  club_id         uuid not null references public.clubs(id) on delete cascade,
  template_id     uuid references public.club_premium_templates(id),
  org             text not null check (org in ('AKC', 'UKC')),
  generated_at    timestamptz not null default now(),
  field_overrides jsonb not null default '{}',
  narrative_edits jsonb not null default '{}'
);

alter table public.premium_generations enable row level security;

create policy "club members can view premium generations"
  on public.premium_generations for select
  using (
    public.is_site_admin()
    or public.is_trial_secretary(club_id)
    or public.is_club_admin(club_id)
  );

create policy "club members can log premium generations"
  on public.premium_generations for insert
  with check (
    public.is_site_admin()
    or public.is_trial_secretary(club_id)
    or public.is_club_admin(club_id)
  );

-- index for consecutive-override detection query
create index premium_generations_club_generated
  on public.premium_generations(club_id, generated_at desc);
