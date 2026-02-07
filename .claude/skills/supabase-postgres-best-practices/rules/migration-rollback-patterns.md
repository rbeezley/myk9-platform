# Migration Rollback Patterns

**Impact: CRITICAL (Recover from failed deployments without data loss)**

Every migration should have a tested rollback plan. Some changes are easy to reverse, others require careful planning.

## Reversible vs Irreversible Changes

### Easily Reversible

```sql
-- Adding column: just drop it
alter table orders add column discount_code text;
-- Rollback:
alter table orders drop column discount_code;

-- Adding index: just drop it
create index concurrently orders_status_idx on orders (status);
-- Rollback:
drop index concurrently orders_status_idx;

-- Adding constraint: just drop it
alter table orders add constraint positive_total check (total >= 0);
-- Rollback:
alter table orders drop constraint positive_total;
```

### Requires Planning

```sql
-- Dropping column: DATA LOSS - must backup first!
-- Before migration:
create table orders_column_backup as
select id, discount_code from orders where discount_code is not null;

alter table orders drop column discount_code;

-- Rollback:
alter table orders add column discount_code text;
update orders o set discount_code = b.discount_code
from orders_column_backup b where o.id = b.id;
drop table orders_column_backup;
```

## Expand-Contract Pattern

For breaking changes, use expand-contract to allow rollback at any point:

### Phase 1: Expand (add new, keep old)

```sql
-- Add new column without removing old
alter table users add column full_name text;

-- Sync data both directions
create or replace function sync_user_names()
returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name then
    new.full_name := new.name;
  elsif new.full_name is distinct from old.full_name then
    new.name := new.full_name;
  end if;
  return new;
end;
$$;

create trigger sync_names before update on users
for each row execute function sync_user_names();

-- Backfill existing data
update users set full_name = name where full_name is null;
```

### Phase 2: Migrate (update application)

```typescript
// Application uses both columns during transition
const user = await db.query(`
  SELECT id, name, full_name,
         COALESCE(full_name, name) as display_name
  FROM users WHERE id = $1
`, [userId]);
```

### Phase 3: Contract (remove old, only after stable)

```sql
-- Only after confirming new code is stable
drop trigger sync_names on users;
drop function sync_user_names();
alter table users drop column name;
```

### Rollback at Any Phase

```sql
-- If issues in Phase 2: just redeploy old code (both columns exist)
-- If issues in Phase 3: restore column from full_name
alter table users add column name text;
update users set name = full_name;
```

## Feature Flags for Database Changes

```sql
-- Create feature flag table
create table feature_flags (
  name text primary key,
  enabled boolean default false,
  rollout_percentage int default 0,
  created_at timestamptz default now()
);

-- Check flag in application or RLS policy
create or replace function is_feature_enabled(feature_name text, user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select case
    when not enabled then false
    when rollout_percentage >= 100 then true
    when rollout_percentage <= 0 then false
    else (hashtext(user_id::text || feature_name) % 100) < rollout_percentage
  end
  from feature_flags
  where name = feature_name;
$$;

-- Use in queries
select * from orders
where user_id = auth.uid()
  and (
    not is_feature_enabled('new_order_schema', auth.uid())
    or new_schema_field is not null
  );
```

## Rollback Checklist

```sql
-- Before any migration, document:
/*
Migration: Add orders.discount_code column
Date: 2024-01-15
Author: developer@example.com

Forward Migration:
  alter table orders add column discount_code text;
  create index concurrently orders_discount_idx on orders (discount_code);

Rollback:
  drop index concurrently orders_discount_idx;
  alter table orders drop column discount_code;

Rollback Data Loss: None
Rollback Time Estimate: < 1 minute
Dependencies: None
*/
```

## Emergency Rollback Procedure

```sql
-- 1. Identify the problem migration
select * from supabase_migrations.schema_migrations
order by version desc limit 5;

-- 2. Check for blocking locks
select
  blocked.pid as blocked_pid,
  blocked.query as blocked_query,
  blocking.pid as blocking_pid,
  blocking.query as blocking_query
from pg_stat_activity blocked
join pg_locks blocked_locks on blocked.pid = blocked_locks.pid
join pg_locks blocking_locks on blocked_locks.locktype = blocking_locks.locktype
  and blocked_locks.relation = blocking_locks.relation
join pg_stat_activity blocking on blocking_locks.pid = blocking.pid
where blocked_locks.granted = false
  and blocking_locks.granted = true;

-- 3. Cancel long-running queries if necessary
select pg_cancel_backend(pid);  -- Graceful
select pg_terminate_backend(pid);  -- Force

-- 4. Execute rollback SQL
-- (use your documented rollback procedure)

-- 5. Verify rollback success
\d orders  -- Check table structure
select count(*) from orders;  -- Verify data
```

## Best Practices

1. **Write rollback SQL with every migration** - Don't wait until you need it
2. **Test rollbacks in staging** - Verify they work before production
3. **Use expand-contract for breaking changes** - Never remove before adding replacement
4. **Backup before destructive changes** - Column drops, table drops, data modifications
5. **Monitor after deployment** - Watch error rates and performance metrics
6. **Have communication plan** - Know who to notify and how during incidents

Reference: https://supabase.com/docs/guides/database/database-migrations
