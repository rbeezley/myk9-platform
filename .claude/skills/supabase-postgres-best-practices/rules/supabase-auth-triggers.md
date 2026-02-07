# Supabase Auth Triggers and User Management

**Impact: HIGH (Proper user data initialization, maintain data integrity)**

Auth triggers automatically create associated data when users sign up. Without them, you need manual synchronization.

## Incorrect (no trigger, manual sync)

```typescript
// Client-side: try to create profile after signup
const { data: authData } = await supabase.auth.signUp({ email, password });

// Race condition: what if this fails?
const { error } = await supabase.from('profiles').insert({
  id: authData.user.id,
  email: authData.user.email,
});
// User exists in auth.users but not in profiles = broken state
```

## Correct (database trigger on auth.users)

```sql
-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Create trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Create trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## Handle User Deletion

```sql
-- Option 1: Cascade delete (automatic via FK)
-- Already handled by: references auth.users(id) on delete cascade

-- Option 2: Soft delete with trigger
create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Soft delete: mark as deleted instead of removing
  update public.profiles
  set
    deleted_at = now(),
    email = 'deleted_' || old.id::text  -- Anonymize
  where id = old.id;

  -- Clean up user's data
  delete from public.user_sessions where user_id = old.id;

  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_deleted();
```

## Sync Profile Updates

```sql
-- Update profile when auth user metadata changes
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data->>'full_name', full_name),
    avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', avatar_url),
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row
  when (old.* is distinct from new.*)
  execute function public.handle_user_updated();
```

## Initialize Default Data

```sql
-- Create default settings, team membership, etc.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_team_id uuid;
begin
  -- Create profile
  insert into public.profiles (id, email)
  values (new.id, new.email);

  -- Create default settings
  insert into public.user_settings (user_id, theme, notifications_enabled)
  values (new.id, 'system', true);

  -- Add to default team if exists
  select id into default_team_id from public.teams where is_default = true limit 1;
  if default_team_id is not null then
    insert into public.team_members (team_id, user_id, role)
    values (default_team_id, new.id, 'member');
  end if;

  return new;
exception
  when others then
    -- Log error but don't fail user creation
    raise warning 'Failed to initialize user data: %', sqlerrm;
    return new;
end;
$$;
```

## Best Practices

1. **Always use `security definer`** - Triggers on auth.users need elevated privileges
2. **Set `search_path = ''`** - Prevent search path injection attacks
3. **Handle errors gracefully** - Don't fail user creation if secondary data fails
4. **Use `on delete cascade`** - Automatically clean up when users are deleted
5. **Keep triggers fast** - Long-running triggers slow down auth operations
6. **Test with edge cases** - OAuth users may have different metadata structure

```sql
-- Check if trigger exists
select * from pg_trigger where tgname = 'on_auth_user_created';

-- Check trigger function
select prosrc from pg_proc where proname = 'handle_new_user';
```

Reference: https://supabase.com/docs/guides/auth/managing-user-data
