-- Phase D: permanent show-day incident log for bites, complaints, DQs, and other reportable events.
-- Incidents are staff-only records tied to a show and optionally to trial/class/entry/dog/handler/judge.

create table if not exists public.show_incidents (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  trial_id uuid references public.trials(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  entry_id uuid references public.entries(id) on delete set null,
  dog_id uuid references public.dogs(id) on delete set null,
  handler_id uuid references public.people(id) on delete set null,
  -- Judges are people rows linked through judge_assignments; keep the person id here.
  judge_id uuid references public.people(id) on delete set null,
  incident_type text not null check (
    incident_type in ('bite', 'complaint', 'dq', 'injury', 'other')
  ),
  severity text not null default 'reportable' check (
    severity in ('note', 'reportable', 'urgent')
  ),
  occurred_at timestamptz not null default now(),
  summary text not null check (char_length(trim(summary)) > 0),
  description text,
  action_taken text,
  dog_name text,
  handler_name text,
  judge_name text,
  created_by uuid not null references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_incidents_show_occurred_idx
  on public.show_incidents(show_id, occurred_at desc);
create index if not exists show_incidents_entry_idx
  on public.show_incidents(entry_id)
  where entry_id is not null;
create index if not exists show_incidents_trial_idx
  on public.show_incidents(trial_id)
  where trial_id is not null;
create index if not exists show_incidents_reportable_idx
  on public.show_incidents(show_id, severity)
  where severity in ('reportable', 'urgent');

alter table public.show_incidents enable row level security;

drop policy if exists "show_incidents_select" on public.show_incidents;
create policy "show_incidents_select" on public.show_incidents
  for select to authenticated
  using ((select public.can_manage_show(show_id)));

drop policy if exists "show_incidents_insert" on public.show_incidents;
create policy "show_incidents_insert" on public.show_incidents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (select public.can_manage_show(show_id))
  );

drop policy if exists "show_incidents_update" on public.show_incidents;
create policy "show_incidents_update" on public.show_incidents
  for update to authenticated
  using ((select public.can_manage_show(show_id)))
  with check ((select public.can_manage_show(show_id)));

drop policy if exists "show_incidents_delete" on public.show_incidents;
create policy "show_incidents_delete" on public.show_incidents
  for delete to authenticated
  using ((select public.can_manage_show(show_id)));

grant select, insert, update, delete on public.show_incidents to authenticated;

drop trigger if exists update_show_incidents_updated_at on public.show_incidents;
create trigger update_show_incidents_updated_at
  before update on public.show_incidents
  for each row
  execute function public.update_updated_at_column();
