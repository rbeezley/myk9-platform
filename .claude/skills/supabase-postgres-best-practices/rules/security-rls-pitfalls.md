# Common RLS Pitfalls and Fixes

**Impact: CRITICAL (Avoid security vulnerabilities and performance issues)**

These are the most common mistakes when implementing Row Level Security, with solutions.

## Pitfall 1: Forgetting to Enable RLS

```sql
-- Table has policies but RLS not enabled = WIDE OPEN!
create policy "Users see own data" on user_data
  for select using (user_id = auth.uid());

-- Check: Is RLS actually enabled?
select relrowsecurity from pg_class where relname = 'user_data';
-- Returns 'f' (false) = POLICIES NOT ENFORCED

-- FIX: Enable RLS
alter table user_data enable row level security;

-- Also force it for table owners
alter table user_data force row level security;
```

## Pitfall 2: Missing Policy for a Command

```sql
-- Only SELECT policy exists
create policy "Users see own orders"
  on orders for select
  using (user_id = auth.uid());

-- INSERT will fail for everyone (no policy = denied)
insert into orders (user_id, total) values (auth.uid(), 100);
-- ERROR: new row violates row-level security policy

-- FIX: Add policies for all needed commands
create policy "Users insert own orders"
  on orders for insert
  with check (user_id = auth.uid());

create policy "Users update own orders"
  on orders for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete own orders"
  on orders for delete
  using (user_id = auth.uid());
```

## Pitfall 3: Function Called Per Row (Performance)

```sql
-- WRONG: auth.uid() called for EVERY row in table
create policy "slow_policy" on orders
  for select using (user_id = auth.uid());

-- With 1M rows, auth.uid() is called 1M times!

-- FIX: Wrap in subquery to cache the value
create policy "fast_policy" on orders
  for select using (user_id = (select auth.uid()));

-- The subquery is evaluated once and cached
```

## Pitfall 4: Subquery in Policy Without Proper Indexing

```sql
-- Policy uses subquery
create policy "Team members see team orders"
  on orders for select
  using (
    team_id in (
      select team_id from team_members
      where user_id = (select auth.uid())
    )
  );

-- Without indexes, this is slow!

-- FIX: Add indexes on all columns used in policy
create index team_members_user_id_idx on team_members (user_id);
create index team_members_team_id_idx on team_members (team_id);
create index orders_team_id_idx on orders (team_id);
```

## Pitfall 5: Leaking Data Through Related Tables

```sql
-- orders has RLS, but order_items doesn't
create policy "Users see own orders" on orders
  for select using (user_id = auth.uid());

-- Attacker can access order data through items!
select oi.*, o.user_id
from order_items oi
join orders o on o.id = oi.order_id;
-- Returns ALL order items with order info

-- FIX: RLS on ALL related tables
alter table order_items enable row level security;
alter table order_items force row level security;

create policy "Users see own order items"
  on order_items for select
  using (
    order_id in (
      select id from orders
      where user_id = (select auth.uid())
    )
  );
```

## Pitfall 6: USING vs WITH CHECK Confusion

```sql
-- USING: filters rows for SELECT, and existing rows for UPDATE/DELETE
-- WITH CHECK: validates new data for INSERT and UPDATE

-- WRONG: Only USING on INSERT (has no effect!)
create policy "broken_insert" on orders
  for insert using (user_id = auth.uid());
-- Inserts won't be checked!

-- FIX: Use WITH CHECK for INSERT
create policy "correct_insert" on orders
  for insert with check (user_id = auth.uid());

-- For UPDATE, you often need both:
create policy "correct_update" on orders
  for update
  using (user_id = auth.uid())       -- Can only update own rows
  with check (user_id = auth.uid()); -- Can't change to another user
```

## Pitfall 7: Infinite Recursion in Policy

```sql
-- Policy references the same table through a function
create function is_order_owner(order_id bigint)
returns boolean as $$
  select exists (
    select 1 from orders     -- This triggers RLS again!
    where id = order_id
    and user_id = auth.uid()
  );
$$ language sql security definer;

-- Using in policy creates infinite loop
create policy "recursive_policy" on orders
  using (is_order_owner(id));  -- INFINITE RECURSION!

-- FIX: Use security definer with set search_path = ''
create or replace function is_order_owner(order_id bigint)
returns boolean
language sql
security definer  -- Runs as function owner, bypasses RLS
set search_path = ''  -- Security best practice
as $$
  select exists (
    select 1 from public.orders
    where id = order_id
    and user_id = (select auth.uid())
  );
$$;
```

## Pitfall 8: Service Role Not Bypassing RLS

```sql
-- Service role queries still filtered by RLS
-- This happens when FORCE ROW LEVEL SECURITY is enabled

-- Check if RLS is forced
select relforcerowsecurity from pg_class where relname = 'orders';

-- Solution 1: Don't force RLS (table owner bypasses)
alter table orders no force row level security;

-- Solution 2: Grant BYPASSRLS to service role (if needed)
alter role service_role bypassrls;

-- Solution 3: Create policy explicitly for service role
create policy "Service role full access"
  on orders for all
  to service_role
  using (true)
  with check (true);
```

## Pitfall 9: Policies Not Applied to Views

```sql
-- RLS on base table not automatically applied through views
create view active_orders as
  select * from orders where status = 'active';

-- Querying view may bypass RLS depending on view security

-- FIX: Use security_invoker views (Postgres 15+)
create view active_orders with (security_invoker = on) as
  select * from orders where status = 'active';

-- Or create RLS on the view itself
-- Or ensure view owner has restricted access
```

## Pitfall 10: Forgetting Anonymous Users

```sql
-- Policy only for authenticated users
create policy "Auth users see own data"
  on profiles for select
  to authenticated
  using (user_id = auth.uid());

-- Anonymous users (anon role) get NO access
-- May be intended, but often forgotten

-- If anon needs some access:
create policy "Anon sees public profiles"
  on profiles for select
  to anon
  using (is_public = true);
```

## RLS Security Checklist

- [ ] RLS enabled on all sensitive tables
- [ ] RLS forced (for table owner enforcement)
- [ ] Policies exist for all CRUD operations needed
- [ ] Related tables also have RLS
- [ ] Subqueries wrapped in SELECT for caching
- [ ] Indexes on all policy columns
- [ ] WITH CHECK used for INSERT/UPDATE validation
- [ ] No infinite recursion in policy functions
- [ ] Service role access tested
- [ ] Anonymous user access considered

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security
