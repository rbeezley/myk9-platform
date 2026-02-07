# Supabase Realtime Database Patterns

**Impact: HIGH (Efficient realtime subscriptions, reduced database load)**

Realtime subscriptions can overwhelm your database if not configured properly. Use filters and understand replication slots.

## Incorrect (unfiltered subscription)

```typescript
// Subscribes to ALL changes on a large table
const channel = supabase
  .channel('orders')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
    (payload) => console.log(payload)
  )
  .subscribe();

// Every insert/update/delete across ALL orders triggers callback
// With 1000 concurrent users, this creates massive load
```

## Correct (filtered subscription with RLS)

```typescript
// Filter to only relevant rows using the filter parameter
const channel = supabase
  .channel('my-orders')
  .on('postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `user_id=eq.${userId}`  // Only this user's orders
    },
    (payload) => handleOrderChange(payload)
  )
  .subscribe();

// Or filter by specific column values
const channel = supabase
  .channel('pending-orders')
  .on('postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      filter: 'status=eq.pending'
    },
    (payload) => notifyNewOrder(payload)
  )
  .subscribe();
```

## Database Configuration

```sql
-- Ensure realtime is enabled for the table
alter publication supabase_realtime add table orders;

-- For filtered subscriptions, add index on filter column
create index orders_user_id_idx on orders (user_id);
create index orders_status_idx on orders (status);

-- Check current publication tables
select * from pg_publication_tables where pubname = 'supabase_realtime';
```

## Best Practices

1. **Always use filters** - Unfiltered subscriptions on large tables cause performance issues
2. **Combine with RLS** - Realtime respects RLS policies, so unauthorized changes won't be sent
3. **Index filter columns** - Columns used in subscription filters should be indexed
4. **Limit subscription scope** - Subscribe only to events you need (INSERT, UPDATE, DELETE)
5. **Clean up subscriptions** - Always unsubscribe when components unmount

```typescript
// Cleanup pattern
useEffect(() => {
  const channel = supabase.channel('my-channel').on(...).subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

Reference: https://supabase.com/docs/guides/realtime/postgres-changes
