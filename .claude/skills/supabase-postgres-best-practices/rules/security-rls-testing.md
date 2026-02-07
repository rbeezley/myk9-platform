# Testing RLS Policies Locally

**Impact: HIGH (Catch policy bugs before production, verify security)**

RLS policies are notoriously hard to test. Use SET ROLE and proper test patterns to verify policies work correctly.

## Incorrect (testing as superuser)

```sql
-- Superuser bypasses RLS by default!
select current_user;  -- postgres (superuser)
select * from orders;  -- Returns ALL orders, RLS not applied

-- This gives false confidence that queries work
-- But in production, RLS will filter results
```

## Correct (test with SET ROLE)

```sql
-- Step 1: Enable RLS for table owner (superuser)
alter table orders force row level security;

-- Step 2: Set the role to test as
set role authenticated;

-- Step 3: Set user context (simulating Supabase auth)
set request.jwt.claims to '{"sub": "user-uuid-123", "role": "authenticated"}';
-- Or using Supabase's auth.uid() function context
select set_config('request.jwt.claim.sub', 'user-uuid-123', true);

-- Step 4: Now queries respect RLS
select * from orders;  -- Only returns orders for user-uuid-123

-- Step 5: Reset to superuser when done
reset role;
```

## Testing Framework for Policies

```sql
-- Create test helper functions
create or replace function test_as_user(user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Set role to authenticated
  execute 'set role authenticated';
  -- Set the user context
  perform set_config('request.jwt.claim.sub', user_id::text, true);
end;
$$;

create or replace function test_reset()
returns void
language plpgsql
security definer
as $$
begin
  reset role;
end;
$$;

-- Use in tests
select test_as_user('11111111-1111-1111-1111-111111111111');
select * from orders;  -- Should only see user 1's orders
select count(*) from orders;  -- Verify count matches expected

select test_as_user('22222222-2222-2222-2222-222222222222');
select * from orders;  -- Should only see user 2's orders

select test_reset();
```

## Comprehensive Policy Test Suite

```sql
-- Test that users can only see their own data
do $$
declare
  user1_id uuid := '11111111-1111-1111-1111-111111111111';
  user2_id uuid := '22222222-2222-2222-2222-222222222222';
  user1_order_count int;
  visible_order_count int;
begin
  -- Count user1's actual orders (as superuser)
  select count(*) into user1_order_count from orders where user_id = user1_id;

  -- Switch to user1 context
  perform test_as_user(user1_id);

  -- Count visible orders
  select count(*) into visible_order_count from orders;

  -- Verify counts match
  if user1_order_count != visible_order_count then
    raise exception 'RLS FAIL: User1 should see % orders but sees %',
      user1_order_count, visible_order_count;
  end if;

  -- Verify user1 cannot see user2's orders
  if exists (select 1 from orders where user_id = user2_id) then
    raise exception 'RLS FAIL: User1 can see User2 orders!';
  end if;

  perform test_reset();
  raise notice 'RLS TEST PASSED: User isolation working correctly';
end;
$$;
```

## Testing INSERT/UPDATE/DELETE Policies

```sql
-- Test INSERT policy
do $$
declare
  user_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  perform test_as_user(user_id);

  -- Should succeed: inserting own order
  insert into orders (user_id, total) values (user_id, 100.00);
  raise notice 'INSERT own order: PASSED';

  -- Should fail: inserting for another user
  begin
    insert into orders (user_id, total)
    values ('22222222-2222-2222-2222-222222222222', 100.00);
    raise exception 'INSERT other user order should have failed!';
  exception when insufficient_privilege then
    raise notice 'INSERT other user order: CORRECTLY BLOCKED';
  end;

  perform test_reset();
  rollback;  -- Clean up test data
end;
$$;

-- Test UPDATE policy
do $$
declare
  user_id uuid := '11111111-1111-1111-1111-111111111111';
  other_user_id uuid := '22222222-2222-2222-2222-222222222222';
  order_id bigint;
begin
  -- Get an order belonging to other user
  select id into order_id from orders where user_id = other_user_id limit 1;

  perform test_as_user(user_id);

  -- Should fail: updating another user's order
  update orders set total = 999 where id = order_id;

  if found then
    raise exception 'UPDATE other user order should not affect rows!';
  else
    raise notice 'UPDATE other user order: CORRECTLY BLOCKED (0 rows)';
  end if;

  perform test_reset();
end;
$$;
```

## Supabase-Specific Testing

```typescript
// Test policies using Supabase client with different auth contexts
import { createClient } from '@supabase/supabase-js';

describe('RLS Policies', () => {
  const supabase = createClient(url, anonKey);

  beforeEach(async () => {
    // Sign in as test user
    await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'testpassword'
    });
  });

  test('user can only see own orders', async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*');

    expect(error).toBeNull();
    // All returned orders should belong to the authenticated user
    data?.forEach(order => {
      expect(order.user_id).toBe(testUserId);
    });
  });

  test('user cannot insert order for another user', async () => {
    const { error } = await supabase
      .from('orders')
      .insert({ user_id: 'other-user-id', total: 100 });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501'); // insufficient_privilege
  });
});
```

## Best Practices

1. **Always use `FORCE ROW LEVEL SECURITY`** - Ensures policies apply to table owner too
2. **Test all CRUD operations** - SELECT, INSERT, UPDATE, DELETE may have different policies
3. **Test edge cases** - NULL values, empty results, boundary conditions
4. **Automate RLS tests** - Run in CI/CD pipeline
5. **Test policy combinations** - Multiple policies on same table combine with OR for same command
6. **Verify service role bypass** - Confirm service role can still access all data when needed

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#testing-policies
