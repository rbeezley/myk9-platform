-- Show announcements for officials to communicate with show participants
-- Scoped per-show: users only see announcements for shows they're participating in

-- Announcements table
create table show_announcements (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_role text not null check (author_role in ('secretary', 'judge', 'club_admin')),
  author_name text,
  title text not null,
  content text not null,
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Read tracking per user per announcement
create table show_announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references show_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  read_at timestamptz not null default now(),
  unique(announcement_id, user_id)
);

-- Indexes
create index idx_show_announcements_show_created
  on show_announcements(show_id, created_at desc);
create index idx_show_announcements_expires
  on show_announcements(expires_at)
  where expires_at is not null;
create index idx_show_announcement_reads_user
  on show_announcement_reads(user_id, announcement_id);

-- RLS
alter table show_announcements enable row level security;
alter table show_announcement_reads enable row level security;

-- Announcements: all authenticated users can read
create policy "Authenticated users can read announcements"
  on show_announcements for select
  using (auth.uid() is not null);

-- Announcements: all authenticated users can insert (app layer checks official role)
create policy "Authenticated users can create announcements"
  on show_announcements for insert
  with check (auth.uid() is not null and auth.uid() = author_id);

-- Announcements: author or platform admin can update
create policy "Author or admin can update announcements"
  on show_announcements for update
  using (
    auth.uid() = author_id
    or exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id in (
          select id from roles where name = 'platform_admin'
        )
        and (user_roles.expires_at is null or user_roles.expires_at > now())
    )
  );

-- Announcements: author or platform admin can delete
create policy "Author or admin can delete announcements"
  on show_announcements for delete
  using (
    auth.uid() = author_id
    or exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id in (
          select id from roles where name = 'platform_admin'
        )
        and (user_roles.expires_at is null or user_roles.expires_at > now())
    )
  );

-- Reads: users manage their own read receipts
create policy "Users manage own read receipts"
  on show_announcement_reads for all
  using (auth.uid() = user_id);

-- Updated_at trigger (function already exists from migration 001)
create trigger update_show_announcements_updated_at
  before update on show_announcements
  for each row
  execute function update_updated_at_column();
