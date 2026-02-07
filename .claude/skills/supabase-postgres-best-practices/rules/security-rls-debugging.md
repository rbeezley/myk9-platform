# Debugging RLS Policies

**Impact: HIGH (Diagnose why queries return wrong results or fail)**

When RLS policies don't work as expected, use these techniques to understand what's happening.

## Check If RLS Is Enabled

```sql
-- Check RLS status for all tables
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  forcerowsecurity as rls_forced
from pg_tables
where schemaname = 'public'
order by tablename;

-- Check specific table
select relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'orders';
```

## List All Policies on a Table

```sql
-- View all policies
select
  schemaname,
  tablename,
  policyname,
  permissive,  -- 'PERMISSIVE' or 'RESTRICTIVE'
  roles,
  cmd,  -- SELECT, INSERT, UPDATE, DELETE, ALL
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where tablename = 'orders'
order by policyname;

-- More readable format
\dp orders
```

## Understand Policy Evaluation

```sql
-- Policies combine as follows:
-- Multiple PERMISSIVE policies: OR (any can grant access)
-- RESTRICTIVE policies: AND with permissive (must also pass)

-- Example: Two permissive SELECT policies
create policy "Users see own orders"
  on orders for select
  using (user_id = auth.uid());

create policy "Admins see all orders"
  on orders for select
  using (is_admin());

-- Result: user sees row if (user_id = auth.uid() OR is_admin())

-- Adding a RESTRICTIVE policy
create policy "Only active orders"
  on orders for select as restrictive
  using (status != 'deleted');

-- Result: user sees row if (user_id = auth.uid() OR is_admin()) AND status != 'deleted'
```

## Debug Why a Query Returns No Rows

```sql
-- Step 1: Check the raw data exists (as superuser)
reset role;
select count(*) from orders where user_id = 'target-user-id';
-- If 0: data doesn't exist, not an RLS issue

-- Step 2: Check what auth context is set
select
  current_user,
  current_setting('role', true) as role,
  current_setting('request.jwt.claim.sub', true) as jwt_sub,
  (select auth.uid()) as auth_uid;

-- Step 3: Manually evaluate the policy expression
select
  o.*,
  (o.user_id = auth.uid()) as passes_policy
from orders o
where o.user_id = 'target-user-id';  -- Run as superuser first

-- Step 4: Check for restrictive policies blocking access
select * from pg_policies
where tablename = 'orders' and permissive = 'RESTRICTIVE';
```

## Debug Policy Performance

```sql
-- Check if policy causes sequential scan
explain (analyze, buffers)
select * from orders;

-- Look for:
-- "Filter:" lines showing RLS policy evaluation
-- Sequential scans on large tables (missing index on policy column)

-- Example output showing problem:
-- Seq Scan on orders (actual time=0.015..450.123 rows=50 loops=1)
--   Filter: (user_id = '...'::uuid)
--   Rows Removed by Filter: 999950

-- Solution: Add index on columns used in policies
create index orders_user_id_idx on orders (user_id);
```

## Common Debugging Scenarios

### Scenario 1: Policy returns no rows unexpectedly

```sql
-- Check if auth.uid() returns expected value
select auth.uid();
-- Returns NULL if not in authenticated context

-- Fix: Ensure JWT is properly set
set request.jwt.claims to '{"sub": "user-uuid", "role": "authenticated"}';
```

### Scenario 2: Policy allows too much access

```sql
-- Check policy expressions
select policyname, qual from pg_policies where tablename = 'orders';

-- Common mistake: using OR instead of AND
-- WRONG:
create policy "bad_policy" on orders
  using (user_id = auth.uid() or team_id in (select team_id from team_members));
-- This allows access if EITHER condition is true

-- CORRECT:
create policy "users_own_orders" on orders
  using (user_id = auth.uid());

create policy "team_orders" on orders
  using (team_id in (select team_id from team_members where user_id = auth.uid()));
```

### Scenario 3: INSERT/UPDATE failing with no clear error

```sql
-- Check WITH CHECK expression separately from USING
select
  policyname,
  qual as using_expr,       -- Checked for SELECT, UPDATE (existing), DELETE
  with_check as check_expr  -- Checked for INSERT, UPDATE (new values)
from pg_policies
where tablename = 'orders' and cmd in ('INSERT', 'UPDATE', 'ALL');

-- Test the WITH CHECK expression manually
select
  (NEW.user_id = auth.uid()) as passes_insert_check
from (select 'some-user-id'::uuid as user_id) as NEW;
```

## Logging Policy Evaluations

```sql
-- Enable logging for RLS debugging (development only!)
alter system set log_statement = 'all';
alter system set log_min_messages = 'debug1';
select pg_reload_conf();

-- Check logs for policy evaluation
-- tail -f /var/log/postgresql/postgresql-*.log

-- Remember to disable in production
alter system reset log_statement;
alter system reset log_min_messages;
select pg_reload_conf();
```

## RLS Debugging Checklist

1. **Is RLS enabled?** - Check `relrowsecurity` on `pg_class`
2. **Is RLS forced?** - Check `relforcerowsecurity` (needed to apply to table owner)
3. **What policies exist?** - Query `pg_policies`
4. **What role am I?** - Check `current_user` and `current_role`
5. **Is auth context set?** - Check `auth.uid()` returns expected value
6. **Do indexes exist?** - Policy columns should be indexed
7. **Are policies permissive or restrictive?** - Understand how they combine
8. **Check USING vs WITH CHECK** - Different for read vs write operations

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security
