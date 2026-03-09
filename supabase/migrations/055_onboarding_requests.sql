-- Club onboarding requests: authenticated users submit requests for new club onboarding
create table onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id),
  club_name text not null,
  organization text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  first_show_date date,
  message text,
  status text not null default 'pending',  -- pending | contacted | onboarded | declined
  created_at timestamptz not null default now(),
  notes text  -- internal notes from admin
);

-- Index for admin filtered queries by status
create index idx_onboarding_requests_status on onboarding_requests(status);

-- RLS: authenticated users can insert their own, only admins can read/update
alter table onboarding_requests enable row level security;

create policy "Authenticated users can submit onboarding request"
  on onboarding_requests for insert
  with check (auth.uid() = auth_user_id);

create policy "Users can view their own requests"
  on onboarding_requests for select
  using (auth.uid() = auth_user_id);

create policy "Admins can read onboarding requests"
  on onboarding_requests for select
  using (is_platform_admin());

create policy "Admins can update onboarding requests"
  on onboarding_requests for update
  using (is_platform_admin());
