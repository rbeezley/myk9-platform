# Zero-Downtime Schema Migrations

**Impact: CRITICAL (Prevent application outages during deployments)**

Schema changes can lock tables and block queries. Use patterns that allow concurrent access during migrations.

## Incorrect (blocking migration)

```sql
-- This locks the entire table for the duration
alter table orders add column total_with_tax numeric(10,2);
update orders set total_with_tax = total * 1.1;  -- Long-running, holds lock

-- All queries to orders table are blocked!
-- Application times out, users see errors
```

## Correct (non-blocking migration pattern)

### Step 1: Add column with no default (instant)

```sql
-- This is instant, no table rewrite
alter table orders add column total_with_tax numeric(10,2);
```

### Step 2: Backfill in batches (non-blocking)

```sql
-- Update in small batches to avoid long locks
do $$
declare
  batch_size int := 1000;
  affected int;
begin
  loop
    update orders
    set total_with_tax = total * 1.1
    where id in (
      select id from orders
      where total_with_tax is null
      limit batch_size
      for update skip locked  -- Don't wait for locked rows
    );

    get diagnostics affected = row_count;
    exit when affected = 0;

    -- Small pause to let other queries through
    perform pg_sleep(0.1);
    commit;
  end loop;
end;
$$;
```

### Step 3: Add constraint after backfill (if needed)

```sql
-- Add NOT NULL constraint after all rows have values
alter table orders alter column total_with_tax set not null;
```

## Adding Indexes Concurrently

```sql
-- WRONG: Locks table during index creation
create index orders_customer_idx on orders (customer_id);

-- CORRECT: Concurrent index creation
create index concurrently orders_customer_idx on orders (customer_id);

-- Note: CONCURRENTLY cannot run inside a transaction
-- In Supabase migrations, use separate migration file
```

## Renaming Columns Safely

```sql
-- WRONG: Breaks application immediately
alter table users rename column name to full_name;

-- CORRECT: Phased approach
-- Step 1: Add new column
alter table users add column full_name text;

-- Step 2: Copy data
update users set full_name = name where full_name is null;

-- Step 3: Create trigger to sync during transition
create or replace function sync_user_name()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.full_name := new.name;
  end if;
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    new.name := new.full_name;
  end if;
  return new;
end;
$$;

create trigger sync_user_name_trigger
before insert or update on users
for each row execute function sync_user_name();

-- Step 4: Deploy application using full_name
-- Step 5: Drop old column and trigger after full rollout
drop trigger sync_user_name_trigger on users;
alter table users drop column name;
```

## Changing Column Types

```sql
-- WRONG: Rewrites entire table, locks it
alter table events alter column metadata type jsonb using metadata::jsonb;

-- CORRECT: Add new column, migrate, switch
alter table events add column metadata_new jsonb;

-- Backfill in batches
update events set metadata_new = metadata::jsonb
where id in (select id from events where metadata_new is null limit 1000);

-- After backfill complete, swap columns
alter table events drop column metadata;
alter table events rename column metadata_new to metadata;
```

## Best Practices

1. **Test migrations on production-size data** - Small test databases hide performance issues
2. **Use `CONCURRENTLY` for indexes** - Never create indexes without it on production
3. **Batch large updates** - Never UPDATE millions of rows in one transaction
4. **Add columns without defaults** - Defaults cause table rewrites in older Postgres
5. **Deploy app changes first** - Make app handle both old and new schema
6. **Have rollback plan** - Know how to undo each migration step

Reference: https://supabase.com/docs/guides/database/database-migrations
