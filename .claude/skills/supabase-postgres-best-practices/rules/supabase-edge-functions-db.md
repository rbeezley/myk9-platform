# Edge Functions Database Access

**Impact: HIGH (Correct connection handling, avoid connection exhaustion)**

Edge Functions run in isolated environments. Each invocation needs proper database connection handling.

## Incorrect (connection per request without pooling)

```typescript
// edge-functions/my-function/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  // Creates new connection every invocation
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data } = await supabase.from('users').select('*');
  return new Response(JSON.stringify(data));
});

// With many concurrent requests, this exhausts connection pool
```

## Correct (reuse client, use connection pooler)

```typescript
// edge-functions/my-function/index.ts
import { createClient } from '@supabase/supabase-js';

// Create client once, outside handler (reused across warm invocations)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false },
    db: { schema: 'public' }
  }
);

Deno.serve(async (req) => {
  // Reuse the client
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400
    });
  }

  return new Response(JSON.stringify(data));
});
```

## Direct Postgres Connection (for complex queries)

```typescript
// Use the pooler connection string for Edge Functions
import postgres from 'https://deno.land/x/postgresjs/mod.js';

// Use transaction mode pooler (port 6543)
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  prepare: false,  // Required for transaction mode pooling
});

Deno.serve(async (req) => {
  const result = await sql`
    SELECT u.id, u.email, COUNT(o.id) as order_count
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    GROUP BY u.id
    HAVING COUNT(o.id) > 10
  `;

  return new Response(JSON.stringify(result));
});
```

## User Context in Edge Functions

```typescript
// Pass user's JWT to respect RLS
Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');

  // Create client with user's token (respects RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader! } }
    }
  );

  // This query respects RLS policies
  const { data } = await supabase.from('user_data').select('*');

  return new Response(JSON.stringify(data));
});
```

## Best Practices

1. **Use pooler connection string** - Always use port 6543 (transaction mode) from Edge Functions
2. **Disable prepared statements** - Set `prepare: false` when using transaction mode pooling
3. **Create client outside handler** - Reuse across warm invocations
4. **Handle errors gracefully** - Edge Functions should return proper error responses
5. **Respect user context** - Pass JWT for user-scoped queries, use service role only when needed
6. **Set timeouts** - Edge Functions have execution limits, ensure queries complete in time

```typescript
// Set statement timeout for safety
const sql = postgres(connectionString, {
  prepare: false,
  connection: {
    statement_timeout: 10000,  // 10 seconds max
  }
});
```

Reference: https://supabase.com/docs/guides/functions/connect-to-postgres
