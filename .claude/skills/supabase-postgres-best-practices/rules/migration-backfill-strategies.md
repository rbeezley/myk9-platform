# Data Backfill Strategies

**Impact: HIGH (Prevent timeouts and locks during large data migrations)**

Backfilling data into new columns or tables requires careful batching to avoid blocking production traffic.

## Incorrect (single large update)

```sql
-- Updates all rows in one transaction
update orders
set shipping_address_id = (
  select id from addresses
  where addresses.user_id = orders.user_id
  and addresses.is_default = true
);

-- With 10M orders:
-- - Locks all rows for duration
-- - Uses excessive memory
-- - Likely to timeout
-- - No progress visibility
```

## Correct (batched backfill with progress)

```sql
-- Create a function for resumable backfills
create or replace function backfill_shipping_addresses(
  batch_size int default 1000,
  max_batches int default null
)
returns table(processed bigint, remaining bigint)
language plpgsql
as $$
declare
  batches_run int := 0;
  rows_updated bigint;
  total_remaining bigint;
begin
  loop
    -- Update one batch
    with batch as (
      select o.id, a.id as address_id
      from orders o
      join addresses a on a.user_id = o.user_id and a.is_default = true
      where o.shipping_address_id is null
      limit batch_size
      for update of o skip locked
    )
    update orders o
    set shipping_address_id = batch.address_id
    from batch
    where o.id = batch.id;

    get diagnostics rows_updated = row_count;

    -- Exit if no more rows or max batches reached
    exit when rows_updated = 0;
    batches_run := batches_run + 1;
    exit when max_batches is not null and batches_run >= max_batches;

    -- Brief pause to reduce contention
    perform pg_sleep(0.05);
  end loop;

  -- Return final counts
  select count(*) into total_remaining
  from orders where shipping_address_id is null;

  processed := batches_run * batch_size;
  remaining := total_remaining;
  return next;
end;
$$;

-- Run backfill (can be interrupted and resumed)
select * from backfill_shipping_addresses(1000, 100);
-- Returns: processed=100000, remaining=500000
```

## Backfill with Progress Tracking

```sql
-- Create progress tracking table
create table backfill_progress (
  name text primary key,
  last_processed_id bigint,
  total_processed bigint default 0,
  started_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Resumable backfill function
create or replace function backfill_with_progress(
  backfill_name text,
  batch_size int default 1000
)
returns void
language plpgsql
as $$
declare
  last_id bigint;
  batch_count int;
begin
  -- Get last position or start from 0
  select coalesce(last_processed_id, 0) into last_id
  from backfill_progress where name = backfill_name;

  if last_id is null then
    insert into backfill_progress (name, last_processed_id)
    values (backfill_name, 0);
    last_id := 0;
  end if;

  -- Process one batch
  with batch as (
    select id from orders
    where id > last_id
    order by id
    limit batch_size
  ),
  updated as (
    update orders o
    set calculated_field = compute_something(o.*)
    from batch
    where o.id = batch.id
    returning o.id
  )
  select count(*), max(id) into batch_count, last_id
  from updated;

  -- Update progress
  if batch_count > 0 then
    update backfill_progress
    set
      last_processed_id = last_id,
      total_processed = total_processed + batch_count,
      updated_at = now()
    where name = backfill_name;
  end if;
end;
$$;

-- Run repeatedly until complete
-- Can be called from a cron job or Edge Function
select backfill_with_progress('orders_calculated_field', 5000);

-- Check progress
select * from backfill_progress;
```

## Parallel Backfill (Multiple Workers)

```sql
-- Each worker handles a different ID range
-- Worker 1: IDs 1-1000000
-- Worker 2: IDs 1000001-2000000
-- etc.

create or replace function backfill_range(
  start_id bigint,
  end_id bigint,
  batch_size int default 1000
)
returns bigint
language plpgsql
as $$
declare
  current_id bigint := start_id;
  total_updated bigint := 0;
  batch_updated int;
begin
  while current_id < end_id loop
    update orders
    set new_column = calculate_value(data)
    where id >= current_id
      and id < least(current_id + batch_size, end_id)
      and new_column is null;

    get diagnostics batch_updated = row_count;
    total_updated := total_updated + batch_updated;
    current_id := current_id + batch_size;

    perform pg_sleep(0.01);
  end loop;

  return total_updated;
end;
$$;

-- Run from multiple connections/workers
-- Connection 1:
select backfill_range(1, 1000000);
-- Connection 2:
select backfill_range(1000001, 2000000);
```

## Best Practices

1. **Always use `FOR UPDATE SKIP LOCKED`** - Prevents blocking other operations
2. **Track progress** - Allow resumption after interruption
3. **Add small delays** - `pg_sleep(0.01)` reduces lock contention
4. **Monitor performance** - Watch `pg_stat_activity` for blocking
5. **Run during low-traffic periods** - Schedule large backfills off-peak
6. **Validate results** - Verify data integrity after backfill completes

```sql
-- Monitor backfill impact
select
  pid,
  state,
  wait_event_type,
  query,
  now() - query_start as duration
from pg_stat_activity
where query ilike '%backfill%';
```

Reference: https://supabase.com/docs/guides/database/database-migrations
